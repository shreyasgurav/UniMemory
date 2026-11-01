"""
Experiment 3 - Retrieval ablation (RQ3). EVAL-ONLY scoring modes on /search:

  cosine  : rank by raw vector cosine similarity (cleaned query)
  lexical : boosted similarity + token overlap + tag match
            (no sector multiplier, waypoint or recency)
  hybrid  : production scoring (all signals; waypoint expansion rarely fires
            because candidates >= limit once the user has >= limit memories)

All three modes rerank the SAME pool: the top min(2*limit, 30) pgvector
candidates, and all use the same cleaned query. Needs the API started with
EVAL_MODE=true. Usage:  python run_exp3_ablation.py          (dev set)
                        python run_exp3_ablation.py --test   (held-out, run once)
"""
import csv
import json

import config
from lib import metrics
from lib.client import UniMemoryClient

MODES = ["cosine", "lexical", "hybrid"]
PHRASINGS = ["query", "paraphrase"]


def main() -> None:
    set_name, queries = config.load_queries()
    end_user = json.loads(config.PERSONAS_FILE.read_text())["persona"]["end_user_id"]
    client = UniMemoryClient()

    rows = []
    for q in queries:
        fg = q["answer_keywords"]
        for phrasing in PHRASINGS:
            text = q[phrasing]
            row = {"id": q["id"], "category": q["category"],
                   "phrasing": phrasing, "text": text}
            for mode in MODES:
                res = client.search(text, end_user=end_user, limit=config.TOP_K,
                                    scoring_mode=mode, reinforce=False)
                texts = [r["content"] for r in res["results"]]
                for k in (1, 3, 5):
                    row[f"{mode}_hit@{k}"] = metrics.hit_at_k(texts, fg, k)
                row[f"{mode}_mrr"] = round(metrics.reciprocal_rank(texts, fg), 3)
            rows.append(row)
            print(f"{q['id']} [{phrasing}] " + " ".join(
                f"{m} h@1={row[m + '_hit@1']}" for m in MODES))

    out = config.result_path("exp3_ablation", set_name)
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    print(f"\n--- means ({set_name} set, n={len(queries)} queries) ---")
    for subset in (None, "query", "paraphrase"):
        sel = [r for r in rows if subset is None or r["phrasing"] == subset]
        for m in MODES:
            print(f"[{subset or 'all':10}] {m:8} "
                  + " ".join(f"hit@{k}={metrics.mean([r[f'{m}_hit@{k}'] for r in sel]):.2f}"
                             for k in (1, 3, 5))
                  + f" mrr={metrics.mean([r[f'{m}_mrr'] for r in sel]):.3f}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
