"""
Experiment 1 - Memory ON vs OFF (RQ1).

For each query, generate an answer with gpt-4o-mini twice:
  OFF: no memory context (stateless baseline)
  ON : top-k retrieved memories injected as context

Outputs (dev by default; --test for the held-out set, run once):
  results/exp1_memory_onoff_<set>.csv   automated keyword rubric + unblinded data
  results/exp1_blind_sheet_<set>.csv    SHUFFLED, unlabeled answers to hand-score
  results/exp1_blind_key_<set>.csv      which answer was ON/OFF (do NOT open until
                                        you have filled in the blind sheet)

Score the blind sheet first, then run:  python run_exp1_memory_onoff.py --unblind
"""
import csv
import json
import random
import sys

import config
from lib import metrics, openai_utils
from lib.client import UniMemoryClient

SYSTEM = (
    "You are a helpful personal assistant. Answer the user's question about "
    "themselves concisely in one sentence. If you do not have the information, "
    "say: 'I don't have that information.'"
)


def build_user_prompt(query: str, memories: list[str] | None) -> str:
    if memories:
        bullets = "\n".join(f"- {m}" for m in memories)
        return f"Here are things I remember about you:\n{bullets}\n\nQuestion: {query}"
    return f"Question: {query}"


def unblind(set_name: str) -> None:
    sheet = {r["blind_id"]: r for r in csv.DictReader(
        config.result_path("exp1_blind_sheet", set_name).open())}
    key = list(csv.DictReader(config.result_path("exp1_blind_key", set_name).open()))
    on, off = [], []
    for k in key:
        score = sheet[k["blind_id"]]["your_score_0_1_2"]
        if score == "":
            sys.exit("Blind sheet not fully scored.")
        (on if k["condition"] == "ON" else off).append(int(score))
    print(f"Manual rubric means ({set_name}): OFF={metrics.mean(off):.2f} "
          f"ON={metrics.mean(on):.2f}  (n={len(on)} per condition)")


def main() -> None:
    set_name, queries = config.load_queries()
    if "--unblind" in sys.argv:
        return unblind(set_name)
    end_user = json.loads(config.PERSONAS_FILE.read_text())["persona"]["end_user_id"]
    client = UniMemoryClient()

    rows, blind = [], []
    for q in queries:
        fg = q["answer_keywords"]
        res = client.search(q["query"], end_user=end_user, limit=config.TOP_K,
                            reinforce=False)
        mem_texts = [r["content"] for r in res["results"]]
        off_ans = openai_utils.generate(SYSTEM, build_user_prompt(q["query"], None))
        on_ans = openai_utils.generate(SYSTEM, build_user_prompt(q["query"], mem_texts))
        rows.append({
            "id": q["id"], "category": q["category"], "query": q["query"],
            "off_answer": off_ans, "off_auto_score": metrics.answer_score(off_ans, fg),
            "on_answer": on_ans, "on_auto_score": metrics.answer_score(on_ans, fg),
        })
        blind += [(q, "OFF", off_ans), (q, "ON", on_ans)]
        print(f"{q['id']} auto OFF={rows[-1]['off_auto_score']} ON={rows[-1]['on_auto_score']}")

    random.Random(1234).shuffle(blind)
    with config.result_path("exp1_blind_sheet", set_name).open("w", newline="") as fs, \
         config.result_path("exp1_blind_key", set_name).open("w", newline="") as fk:
        ws = csv.writer(fs); wk = csv.writer(fk)
        ws.writerow(["blind_id", "query", "answer", "your_score_0_1_2"])
        wk.writerow(["blind_id", "query_id", "condition"])
        for i, (q, cond, ans) in enumerate(blind, 1):
            ws.writerow([f"b{i:03d}", q["query"], ans, ""])
            wk.writerow([f"b{i:03d}", q["id"], cond])

    out = config.result_path("exp1_memory_onoff", set_name)
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    print(f"\nAuto rubric means: OFF={metrics.mean([r['off_auto_score'] for r in rows]):.2f} "
          f"ON={metrics.mean([r['on_auto_score'] for r in rows]):.2f} (max 2.0)")
    print(f"Wrote {out}\nNow hand-score results/exp1_blind_sheet_{set_name}.csv "
          f"(rubric: 0 wrong/generic, 1 partial, 2 correct), then run with --unblind.")


if __name__ == "__main__":
    main()
