"""
Deploy Customer 360 assets to the Fabric workspace in config.json, using your Azure CLI sign-in.

    python deploy.py upload                         # data/testdata/output -> lakehouse Files/
    python deploy.py notebook c360_customer_dimension [--run]
    python deploy.py run c360_customer_dimension    # run an existing notebook and wait
    python deploy.py download                       # lakehouse Files/_reports/* -> ./_reports/*.csv

Notebooks live in notebooks/*.py as plain Python with "# %%" cell markers (optionally
"# %% [markdown]"); they're converted to .ipynb and attached to the lakehouse on deploy.
Requires: `az login --allow-no-subscriptions` with an account that can edit the workspace.
"""

from __future__ import annotations

import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
CFG = json.loads((HERE / "config.json").read_text())
WS, LH = CFG["workspace_id"], CFG["lakehouse_id"]
FABRIC = "https://api.fabric.microsoft.com/v1"
ONELAKE = f"https://onelake.dfs.fabric.microsoft.com/{WS}/{LH}"
_tokens: dict[str, str] = {}


def token(resource: str) -> str:
    if resource not in _tokens:
        out = subprocess.run(f'az account get-access-token --resource {resource} --query accessToken -o tsv',
                             shell=True, capture_output=True, text=True)
        if out.returncode:
            sys.exit(f"Could not get a token for {resource}. Run: az login --allow-no-subscriptions\n{out.stderr}")
        _tokens[resource] = out.stdout.strip()
    return _tokens[resource]


def call(method: str, url: str, body=None, resource="https://api.fabric.microsoft.com", raw: bytes | None = None,
         headers: dict | None = None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"Authorization": f"Bearer {token(resource)}"}
    if body is not None:
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode() or "{}"
            return r.status, dict(r.headers), (json.loads(txt) if txt.strip().startswith(("{", "[")) else txt)
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url} -> {e.code}\n{e.read().decode()[:2000]}")


def wait_operation(headers: dict, what: str):
    """Poll a Fabric long-running operation until it finishes."""
    loc = headers.get("Location") or headers.get("location")
    if not loc:
        return None
    while True:
        time.sleep(int(headers.get("Retry-After", 5)))
        _, headers, body = call("GET", loc)
        status = body.get("status") if isinstance(body, dict) else None
        if status in ("Succeeded", "Completed"):
            return body
        if status in ("Failed", "Cancelled", "Deduped"):
            sys.exit(f"{what} {status}: {json.dumps(body.get('error') or body.get('failureReason') or body, indent=2)}")
        print(f"  {what}: {status or 'running'}...")


# ---------------------------------------------------------------------------------------------
def upload(src: Path = HERE.parent / "data" / "testdata" / "output"):
    if not src.exists():
        sys.exit(f"{src} not found - run data/testdata/generate_testdata.py first")
    storage = "https://storage.azure.com/"
    for f in sorted(p for p in src.rglob("*") if p.is_file()):
        rel = f.relative_to(src).as_posix()
        url = f"{ONELAKE}/Files/{rel}"
        data = f.read_bytes()
        call("PUT", f"{url}?resource=file", resource=storage, raw=b"")
        pos, chunk = 0, 32 * 1024 * 1024
        while pos < len(data):
            part = data[pos:pos + chunk]
            call("PATCH", f"{url}?action=append&position={pos}", resource=storage, raw=part)
            pos += len(part)
        call("PATCH", f"{url}?action=flush&position={len(data)}", resource=storage, raw=b"")
        print(f"  Files/{rel}  ({len(data) / 1e6:.1f} MB)")


def download(folder: str = "Files/_reports", dest: Path = HERE / "_reports"):
    """Download the CSV part files Spark wrote under a lakehouse folder (one file per sub-folder)."""
    storage = "https://storage.azure.com/"
    _, _, body = call("GET", f"https://onelake.dfs.fabric.microsoft.com/{WS}?resource=filesystem&recursive=true"
                             f"&directory={LH}/{folder}", resource=storage)
    for p in body.get("paths", []):
        name = p["name"]
        is_part = name.endswith(".csv") and "/part-" in name
        if is_part or name.endswith(".txt"):
            report = name.split("/")[-2] if is_part else name.split("/")[-1].rsplit(".", 1)[0]
            _, _, text = call("GET", f"https://onelake.dfs.fabric.microsoft.com/{WS}/{name.split('/', 1)[1] if name.startswith(WS) else name}",
                              resource=storage)
            dest.mkdir(parents=True, exist_ok=True)
            out = dest / (f"{report}.csv" if is_part else f"{report}.txt")
            out.write_text(text if isinstance(text, str) else json.dumps(text), encoding="utf-8")
            print(f"  {out.relative_to(HERE)}")


def to_ipynb(py: str) -> dict:
    cells, cur, kind = [], [], "code"

    def flush():
        text = "\n".join(cur).strip("\n")
        if text:
            if kind == "markdown":
                text = "\n".join(l[2:] if l.startswith("# ") else l.lstrip("#") for l in text.splitlines())
            src = [l + "\n" for l in text.splitlines()]
            src[-1] = src[-1].rstrip("\n")
            cell = {"cell_type": kind, "metadata": {}, "source": src}
            if kind == "code":
                cell.update(execution_count=None, outputs=[])
            cells.append(cell)

    for line in py.splitlines():
        if line.startswith("# %%"):
            flush()
            cur, kind = [], ("markdown" if "[markdown]" in line else "code")
        else:
            cur.append(line)
    flush()
    return {"nbformat": 4, "nbformat_minor": 5, "cells": cells, "metadata": {
        "language_info": {"name": "python"},
        "kernel_info": {"name": "synapse_pyspark"},
        "kernelspec": {"name": "synapse_pyspark", "display_name": "Synapse PySpark"},
        "dependencies": {"lakehouse": {"default_lakehouse": LH, "default_lakehouse_name": CFG["lakehouse_name"],
                                       "default_lakehouse_workspace_id": WS}}}}


def find_item(name: str, kind: str = "Notebook"):
    _, _, body = call("GET", f"{FABRIC}/workspaces/{WS}/items?type={kind}")
    return next((i["id"] for i in body.get("value", []) if i["displayName"] == name), None)


def deploy_notebook(name: str):
    nb = to_ipynb((HERE / CFG["notebooks"][name]).read_text(encoding="utf-8"))
    definition = {"format": "ipynb", "parts": [{"path": "notebook-content.ipynb", "payloadType": "InlineBase64",
                                                "payload": base64.b64encode(json.dumps(nb).encode()).decode()}]}
    item = find_item(name)
    if item:
        _, h, _ = call("POST", f"{FABRIC}/workspaces/{WS}/notebooks/{item}/updateDefinition", {"definition": definition})
        wait_operation(h, "update")
        print(f"Updated notebook {name} ({item})")
    else:
        _, h, _ = call("POST", f"{FABRIC}/workspaces/{WS}/notebooks",
                       {"displayName": name, "description": "Customer 360: bronze -> silver -> unified customer dimension",
                        "definition": definition})
        wait_operation(h, "create")
        item = find_item(name)
        print(f"Created notebook {name} ({item})")
    return item


def run_notebook(name: str):
    item = find_item(name) or sys.exit(f"Notebook {name} not found")
    _, h, _ = call("POST", f"{FABRIC}/workspaces/{WS}/items/{item}/jobs/instances?jobType=RunNotebook", {})
    loc = h.get("Location") or h.get("location")
    print(f"Running {name}...")
    start = time.time()
    while True:
        time.sleep(15)
        _, _, body = call("GET", loc)
        st = body.get("status")
        print(f"  {st} ({int(time.time() - start)}s)")
        if st == "Completed":
            return
        if st in ("Failed", "Cancelled", "Deduped"):
            sys.exit(f"Notebook run {st}: {json.dumps(body.get('failureReason'), indent=2)}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "upload":
        upload()
    elif args[0] == "notebook":
        deploy_notebook(args[1])
        if "--run" in args:
            run_notebook(args[1])
    elif args[0] == "run":
        run_notebook(args[1])
    elif args[0] == "download":
        download()
    else:
        sys.exit(__doc__)
