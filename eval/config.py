"""
Central configuration for the UniMemory evaluation harness.

All values can be overridden via environment variables (or a .env file in
eval/). Nothing here changes production behavior; this harness only talks to
the API over HTTP and (for the setup/reset scripts) to the DB directly.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

EVAL_DIR = Path(__file__).resolve().parent
load_dotenv(EVAL_DIR / ".env")

# --- API endpoint -----------------------------------------------------------
# Local by default. For the latency experiment the plan says to point this at
# Railway and note that results include network time.
API_BASE_URL = os.getenv("EVAL_API_BASE_URL", "http://localhost:8000/api/v1")

# The raw API key for the dedicated eval test user. Written by
# setup_test_user.py into eval/.eval_key and read back here.
_KEY_FILE = EVAL_DIR / ".eval_key"


def get_api_key() -> str:
    key = os.getenv("EVAL_API_KEY")
    if key:
        return key.strip()
    if _KEY_FILE.exists():
        return _KEY_FILE.read_text().strip()
    raise RuntimeError(
        "No eval API key found. Run `python setup_test_user.py` first, "
        "or set EVAL_API_KEY."
    )


# --- Test user identity ------------------------------------------------------
# A dedicated, isolated user so real account data never contaminates results.
TEST_USER_EMAIL = os.getenv("EVAL_TEST_EMAIL", "eval+unimemory@example.com")
TEST_USER_FIREBASE_UID = os.getenv("EVAL_TEST_UID", "eval-harness-fixed-uid")
# end-user string id used in ingest/search calls (multi-tenant inner id)
TEST_END_USER = os.getenv("EVAL_END_USER", "persona-alex")

# --- OpenAI (for E1 generation and E2 raw-RAG embeddings) --------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
# Keep in sync with api/app/config.py so the raw baseline uses the SAME model.
EMBEDDING_MODEL = os.getenv("EVAL_EMBEDDING_MODEL", "text-embedding-3-small")
GEN_MODEL = os.getenv("EVAL_GEN_MODEL", "gpt-4o-mini")

# --- Paths -------------------------------------------------------------------
DATA_DIR = EVAL_DIR / "data"
RESULTS_DIR = EVAL_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

PERSONAS_FILE = DATA_DIR / "personas.json"
QUERIES_DEV_FILE = DATA_DIR / "queries_dev.json"
QUERIES_TEST_FILE = DATA_DIR / "queries_test.json"

def load_queries() -> tuple[str, list]:
    """Return (set_name, queries). Defaults to the DEV set. The held-out TEST
    set is only used when `--test` is passed, so it is run deliberately and once."""
    import json
    import sys
    name = "test" if "--test" in sys.argv else "dev"
    path = QUERIES_TEST_FILE if name == "test" else QUERIES_DEV_FILE
    return name, json.loads(path.read_text())["queries"]


def result_path(stem: str, set_name: str) -> Path:
    return RESULTS_DIR / f"{stem}_{set_name}.csv"


# --- Retrieval settings used across experiments ------------------------------
TOP_K = int(os.getenv("EVAL_TOP_K", "5"))
# How long to wait for background extraction to finish after ingestion.
INGEST_SETTLE_SECONDS = int(os.getenv("EVAL_INGEST_SETTLE", "90"))
