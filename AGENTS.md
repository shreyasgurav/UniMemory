# UniMemory — notes for agents

## Research paper + evaluation (final-year project)

- Paper: `paper/main.tex` (IEEE conference, IEEEtran). Compile on Overleaf or
  full TeX Live: `pdflatex → bibtex → pdflatex ×2`. `\result{}`/`\todo{}` are
  red draft markers; set `\draftfalse` for the clean build.
- Eval harness: `eval/` (see `eval/README.md`). Run order: `setup_test_user.py`
  → `reset_test_data.py` → `ingest_dataset.py` → `run_exp3/2/1` → `run_exp4`
  (latency against Railway). CSVs land in `eval/results/`.

## VERIFIED code facts (trust these, NOT the slides/ARCHITECTURE.md)

The slides, `ARCHITECTURE.md`, `WORKFLOW_DIAGRAMS.md` contain claims the code
does NOT implement. Correct facts:

- Embeddings: `text-embedding-3-small`, **1536 dims** (`api/app/config.py`),
  NOT 768.
- LLM: `gpt-4o-mini`.
- Retrieval (`api/app/core/search.py`): **hybrid weighted scoring**, NOT LLM
  reranking. Weights: similarity 0.30 (boosted `1-e^{-3σ}`), overlap 0.15,
  tag_match 0.15, waypoint 0.10, recency 0.10, coactivation 0.20; plus a sector
  multiplier. Waypoint graph expansion only when avg cosine < 0.5 and
  candidates < limit. Search triggers async reinforcement (salience/recall/
  waypoint boosts) — a confound for eval.
- Dedup: **SimHash only** (`api/app/core/simhash.py`), Hamming ≤ 3, boosts the
  existing memory's salience. NOT semantic/cosine dedup.
- Worthiness gate (`api/app/core/extractor.py`) **fails open on timeout**.
- `/ingest/*` is async (returns immediately; extraction runs in background).
  `/memories` is synchronous explicit storage.

## Eval-only API flags (production defaults unchanged)

`POST /search` accepts optional `scoring_mode` ("hybrid"|"cosine") and
`reinforce` (bool). Omitted by all prod/SDK callers. Plumbed into
`hybrid_search(... scoring_mode="hybrid", reinforce=True)`.

## Resume caveat (for the applicant, not code)

Earlier frontend claims "1000+ nodes / requestAnimationFrame / 20+ components"
were NOT verified. `MemoryGraph.tsx` fetches `limit=50` and redraws via
`useEffect` (no rAF). Count things before claiming them.
