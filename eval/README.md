# UniMemory Evaluation Harness

Reproducible experiments for the research paper. Talks to the API over HTTP and
writes one CSV per experiment into `results/`.

## What it measures

| Exp | File | Research question | Needs OpenAI? |
|-----|------|-------------------|---------------|
| E1  | `run_exp1_memory_onoff.py` | Does memory-augmented generation beat a stateless LLM? (RQ1) | yes (generation) |
| E2  | `run_exp2_structured_vs_raw.py` | Do extracted memories retrieve better than raw-chat RAG? (RQ2) | yes (embeddings) |
| E3  | `run_exp3_ablation.py` | cosine vs lexical vs hybrid re-ranking (RQ3) | no |
| E4  | `run_exp4_latency_dedup.py` | Latency and dedup cost (RQ4) | no |

## Design rules (baked in)

- **Isolated test user.** A dedicated user with a fixed fake `firebase_uid`, so
  your real memories never enter the retrieval pool.
- **Dev/test split.** Report `data/queries_test.json`. Do **not** tune anything
  after seeing test results; use `data/queries_dev.json` for sanity checks.
- **Eval-only switches.** `scoring_mode` (`hybrid`/`lexical`/`cosine`) and
  `reinforce` are optional `/search` fields. The server returns 403 unless it
  runs with `EVAL_MODE=true`; defaults are production behavior. Experiments pass
  `reinforce=False` so repeated queries don't mutate state.
- **Synthetic data.** The persona corpus is fictional and authored by us.

## Where things run (read this first)

Your stack: API on **Railway**, DB on **Supabase**, **OpenAI** for embeddings/LLM.
The setup/reset scripts talk to the database directly, so whichever DB
`DATABASE_URL` points at will contain the eval user. Recommended:

| Step | Where | Why |
|------|-------|-----|
| E1, E2, E3 (quality) | **Local API** (`EVAL_MODE=true`) -> a **separate, free Supabase project** `unimemory-eval` | clean, disposable DB; eval flags stay OFF in production |
| E4 (latency) | **Railway API** (production defaults, no eval flags) | what real users hit; includes network time |

For E4 the eval user must exist in the DB Railway uses (production Supabase).
It is isolated by `owner_id` and `reset_test_data.py` deletes only that user's
rows, but it is still your production DB. If you prefer zero contact with
production, skip Railway and run E4 locally against the eval DB, and say so in
the paper ("latency measured against a local API and a remote Supabase DB").

## Prerequisites

1. Create a **new Supabase project** for eval; enable `vector`
   (`create extension vector;`) and run the API once so tables are created
   (or run your migrations against it).
2. Use **shell exports, not .env files** (the API's settings loader rejects unknown
   keys in a `.env` in the current directory, and `api/.env` probably points at
   production). In the terminal you use for BOTH the API and the eval scripts:
   ```bash
   export DATABASE_URL='postgresql+asyncpg://USER:PASS@HOST:5432/postgres'  # eval project only
   export OPENAI_API_KEY='sk-...'
   export EVAL_MODE=true
   export EVAL_API_BASE_URL='http://localhost:8000/api/v1'
   ```
   Start the API from `api/`: `uvicorn app.main:app --port 8000` (it creates tables).
3. `pip install -r eval/requirements.txt` in the **same** venv as `api/`.
   **Never paste keys or DB URLs into chat or commit them.** Expect a few dollars of
   OpenAI credit at this scale.

## Run order (dev first, test ONCE)

```bash
cd eval
python setup_test_user.py            # isolated user + API key (.eval_key)
python reset_test_data.py            # clean slate
python ingest_dataset.py             # structured pipeline; waits for extraction

# sanity checks on the DEV set (default). Fix bugs here only.
python run_exp3_ablation.py
python run_exp2_structured_vs_raw.py
python run_exp1_memory_onoff.py      # then hand-score exp1_blind_sheet_dev.csv
python run_exp1_memory_onoff.py --unblind

# freeze everything, then run the held-out TEST set exactly once
python run_exp3_ablation.py --test
python run_exp2_structured_vs_raw.py --test
python run_exp1_memory_onoff.py --test   # hand-score blind sheet, then --unblind --test

# latency: set EVAL_API_BASE_URL to the Railway URL (+ eval user in that DB)
python run_exp4_latency_dedup.py
python reset_test_data.py            # remove scratch + persona data
```

Do not change weights, prompts or queries after seeing TEST results.

## Outputs

- `results/exp1_memory_onoff_<set>.csv` (auto rubric), `exp1_blind_sheet_<set>.csv`
  (shuffled, unlabeled; hand-score it) and `exp1_blind_key_<set>.csv` (open last).
- `results/exp2_structured_vs_raw_<set>.csv` — hit@1/3/5, MRR, tokens injected.
- `results/exp3_ablation_<set>.csv` — cosine vs lexical vs hybrid, exact vs paraphrased.
- `results/exp4_latency.csv` (cold and warm separately), `results/exp4_dedup.csv`.

## Honest caveats (also stated in the paper)

- Relevance is keyword-grounded (automated proxy); E1 answers are also saved
  for manual verification.
- Single synthetic persona, one LLM, hand-tuned weights.
- Latency against Railway includes network time.
- The worthiness gate fails open on timeout (may store borderline items).
