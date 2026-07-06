"""
Loader for the repo-root `pipeline/pii_mask.py` module.

The masking logic lives outside the backend package on purpose — it is the
single source of truth that also gets pasted into the n8n Function node
(see PLAN.md #21). This shim imports it by path so the relay endpoints and
n8n never drift apart.
"""
import importlib.util
from pathlib import Path

_PII_PATH = Path(__file__).resolve().parents[3] / "pipeline" / "pii_mask.py"

_spec = importlib.util.spec_from_file_location("pii_mask", _PII_PATH)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

mask_message = _mod.mask_message
llm_second_pass = _mod.llm_second_pass
