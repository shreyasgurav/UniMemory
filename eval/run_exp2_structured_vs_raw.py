"""
Experiment 2 - Structured memories vs raw-chat RAG (RQ2).

Structured: retrieve from UniMemory's extracted memories via /search.
Raw:        chunk the original conversations, embed with the SAME model
            (text-embedding-3-small), and retrieve top-k by cosine similarity.

Relevance for BOTH sides uses the same keyword-group test, so the comparison
is fair. We also report tokens injected (context size) per side.

Prereq: dataset ingested, OPENAI_API_KEY set.
Output: results/exp2_structured_vs_raw_<set>.csv  (dev by default; --test for held-out)

Baseline fairness: same embedding model, same top-k, one chunk per message
(user AND assistant turns), same keyword-group relevance test on both sides.
"""
import csv
import json

import numpy as np

import config
from lib import metrics, openai_utils
from lib.client import UniMemoryClient


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return float(a @ b / (na * nb)) if na and nb else 0.0


def build_raw_chunks(personas: dict) -> list[dict]:
    """One chunk per message (role-tagged), keeping its conversation id."""
    chunks = []
    for conv in personas["conversations"]:
        for i, m in enumerate(conv["messages"]):
            chunks.append({
                "conv_id": conv["id"],
                "text": m["content"],
                "chunk_id": f"{conv['id']}#{i}",
            })
    return chunks


def main() -> None:
    personas = json.loads(config.PERSONAS_FILE.read_text())
    set_name, queries = config.load_queries()
    end_user = personas["persona"]["end_user_id"]
    client = UniMemoryClient()

    # Pre-embed raw chunks once.
    chunks = build_raw_chunks(personas)
    chunk_vecs = np.array(openai_utils.embed([c["text"] for c in chunks]))

    rows = []
    for q in queries:
        fg = q["answer_keywords"]

        # --- structured side ---
        s_res = client.search(q["query"], end_user=end_user, limit=config.TOP_K,
                             reinforce=False)
        s_texts = [r["content"] for r in s_res["results"]]

        # --- raw side ---
        qv = np.array(openai_utils.embed_one(q["query"]))
        sims = [cosine(qv, v) for v in chunk_vecs]
        order = np.argsort(sims)[::-1][:config.TOP_K]
        r_texts = [chunks[i]["text"] for i in order]

        row = {
            "id": q["id"], "category": q["category"], "query": q["query"],
            "structured_hit@1": metrics.hit_at_k(s_texts, fg, 1),
            "structured_hit@3": metrics.hit_at_k(s_texts, fg, 3),
            "structured_hit@5": metrics.hit_at_k(s_texts, fg, 5),
            "structured_mrr": round(metrics.reciprocal_rank(s_texts, fg), 3),
            "structured_tokens": sum(metrics.count_tokens(t) for t in s_texts),
            "raw_hit@1": metrics.hit_at_k(r_texts, fg, 1),
            "raw_hit@3": metrics.hit_at_k(r_texts, fg, 3),
            "raw_hit@5": metrics.hit_at_k(r_texts, fg, 5),
            "raw_mrr": round(metrics.reciprocal_rank(r_texts, fg), 3),
            "raw_tokens": sum(metrics.count_tokens(t) for t in r_texts),
        }
        rows.append(row)
        print(f"{q['id']} struct h@3={row['structured_hit@3']} "
              f"raw h@3={row['raw_hit@3']}")

    out = config.result_path("exp2_structured_vs_raw", set_name)
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    def avg(col):
        return metrics.mean([r[col] for r in rows])

    print("\n--- means over the selected query set ---")
    for side in ("structured", "raw"):
        print(f"{side}: hit@1={avg(side+'_hit@1'):.2f} "
              f"hit@3={avg(side+'_hit@3'):.2f} hit@5={avg(side+'_hit@5'):.2f} "
              f"mrr={avg(side+'_mrr'):.3f} tokens={avg(side+'_tokens'):.1f}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
