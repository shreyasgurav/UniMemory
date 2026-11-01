"""
Experiment 4 - Latency and deduplication (RQ4).

Latency uses PRODUCTION defaults (no eval flags), so it works against Railway
without EVAL_MODE. Note: production search also fires background reinforcement,
which only mutates the isolated eval user's data.

Two caches affect latency, so cold and warm are reported SEPARATELY:
  - the in-process query-embedding cache (1h TTL, keyed on the cleaned query)
  - the Redis API-key cache (warmed by one throwaway request first)
COLD: distinct queries (each with a unique nonce suffix) -> every call pays the
      OpenAI embedding round-trip.
WARM: one fixed query repeated -> embedding served from cache.
Latency against Railway includes network time (state this in the paper).

Dedup runs against a scratch end-user via /memories (SimHash, Hamming <= 3).
Outputs: results/exp4_latency.csv, results/exp4_dedup.csv
Afterwards run reset_test_data.py to remove scratch data.
"""
import csv
import json
import uuid

import config
from lib import metrics
from lib.client import UniMemoryClient

WARM_RUNS = 30
DEDUP_USER = "dedup-probe"


def run_latency(client: UniMemoryClient, end_user: str) -> None:
    client.search("warm up api key cache", end_user=end_user, limit=config.TOP_K)  # discarded

    texts = []
    for path in (config.QUERIES_DEV_FILE, config.QUERIES_TEST_FILE):
        for q in json.loads(path.read_text())["queries"]:
            texts += [q["query"], q["paraphrase"]]
    cold = [client.search(f"{t} {uuid.uuid4().hex[:6]}", end_user=end_user,
                          limit=config.TOP_K)["elapsed_ms"] for t in texts]

    fixed = "What database does the UniMemory project use?"
    client.search(fixed, end_user=end_user, limit=config.TOP_K)  # prime embedding cache
    warm = [client.search(fixed, end_user=end_user, limit=config.TOP_K)["elapsed_ms"]
            for _ in range(WARM_RUNS)]

    out = config.RESULTS_DIR / "exp4_latency.csv"
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["condition", "run", "elapsed_ms"])
        for cond, xs in (("cold", cold), ("warm", warm)):
            for i, ms in enumerate(xs):
                w.writerow([cond, i, round(ms, 2)])
    print(f"Latency vs {client.base_url}")
    for cond, xs in (("cold", cold), ("warm", warm)):
        print(f"  {cond:4} n={len(xs):3} mean={metrics.mean(xs):7.1f}ms "
              f"p50={metrics.percentile(xs, 50):7.1f}ms p95={metrics.percentile(xs, 95):7.1f}ms")
    print(f"  wrote {out}")


def run_dedup(client: UniMemoryClient) -> None:
    cases = [
        ("exact_duplicate", "Alex's favorite color is teal."),
        ("near_duplicate", "Alex's favourite colour is teal."),
        ("distinct", "Alex's lucky number is seventeen."),
    ]
    base_id = client.add_memory("Alex's favorite color is teal.", end_user=DEDUP_USER)["id"]
    rows = [{"case": c, "input": t,
             "deduped": client.add_memory(t, end_user=DEDUP_USER)["id"] == base_id}
            for c, t in cases]
    out = config.RESULTS_DIR / "exp4_dedup.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["case", "input", "deduped"])
        w.writeheader(); w.writerows(rows)
    print("\nDedup (True = collapsed into the base memory):")
    for r in rows:
        print(f"  {r['case']:16} deduped={r['deduped']}")
    print(f"  wrote {out}")


def main() -> None:
    end_user = json.loads(config.PERSONAS_FILE.read_text())["persona"]["end_user_id"]
    client = UniMemoryClient()
    run_latency(client, end_user)
    run_dedup(client)


if __name__ == "__main__":
    main()
