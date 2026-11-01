# UniMemory research paper (draft)

IEEE conference format (`IEEEtran`). Compile on Overleaf, or locally:

```bash
pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
```

`main.pdf` is the last local build (5 pages).

## Status

- Written: Intro, Related Work (5 verified arXiv refs), System Design, Implementation,
  Evaluation Methodology, Discussion/Limitations, Conclusion.
- Figures 1-3 are TikZ (architecture, ingestion pipeline, retrieval) and match the code.
- Section 6 holds **preliminary dev-set pilot** numbers taken from
  `eval/results/*_dev.csv` (6 queries, 31 memories, synthetic persona).

## Still to do (after the final test run)

1. Expand the corpus with distractor conversations, freeze it, run the **test set once**
   (`eval/README.md`), hand-score E1 blind, and run E4 (latency, dedup).
2. Replace the "Pending Measurements" subsection and the abstract's pilot wording with
   final numbers; add latency/dedup results.
3. Case study (Section 7): add annotated screenshots (extension capture -> MCP retrieval
   in an IDE) and a screenshots figure.
4. Check whether the college requires its own template instead of IEEEtran.

## Accuracy rule

Describe the system as the code does (see `AGENTS.md`): hybrid re-ranking over the
vector-search pool, SimHash dedup, 1536-d embeddings, coactivation inactive.
Never claim LLM reranking, semantic dedup, or that graph/recency/coactivation help results.
