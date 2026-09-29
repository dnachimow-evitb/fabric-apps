# %% [markdown]
# # Customer 360: pipeline runner
# Runs the build notebooks in order and writes the outcome (including the full error of a failed step)
# to `Files/_reports/pipeline_status/status.txt`, so failures can be diagnosed outside the Fabric UI.

# %%
import traceback

STEPS = ["c360_customer_dimension", "c360_customer_metrics", "c360_sku_risk", "c360_summary_export"]
START_AT = "c360_customer_dimension"   # skip steps already built; set to STEPS[0] for a full rebuild

log = []
for step in STEPS[STEPS.index(START_AT):]:
    try:
        notebookutils.notebook.run(step, 3600)
        log.append(f"OK   {step}")
    except Exception as e:
        log.append(f"FAIL {step}\n{e}\n{traceback.format_exc()}")
        break
notebookutils.fs.put("Files/_reports/pipeline_status/status.txt", "\n".join(log), True)
print("\n".join(log))
