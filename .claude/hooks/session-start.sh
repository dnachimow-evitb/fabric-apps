#!/bin/bash
# Installs Microsoft Power Platform tooling in Claude Code on the web sessions:
#   pac  - Power Platform CLI (Power Apps, Dataverse, solutions)
#   m365 - CLI for Microsoft 365 (Power Automate flows)
#   fab  - Microsoft Fabric CLI (Fabric and Power BI workspaces, reports, semantic models)
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v dotnet >/dev/null 2>&1; then
  apt-get update -qq || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq dotnet-sdk-10.0
fi

TOOLS_DIR="$HOME/.dotnet/tools"
if [ ! -x "$TOOLS_DIR/pac" ]; then
  dotnet tool install --global Microsoft.PowerApps.CLI.Tool
fi

if ! command -v m365 >/dev/null 2>&1; then
  npm install -g --silent @pnp/cli-microsoft365
fi

if [ ! -x /opt/fabric-cli/bin/fab ]; then
  python3 -m venv /opt/fabric-cli
  /opt/fabric-cli/bin/pip install -q --disable-pip-version-check ms-fabric-cli
fi
ln -sf /opt/fabric-cli/bin/fab /usr/local/bin/fab

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"\$PATH:$TOOLS_DIR\"" >> "$CLAUDE_ENV_FILE"
fi
