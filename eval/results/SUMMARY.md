# UniMemory evaluation: SUMMARY

Status: **all automated runs complete** (dev, test E1/E2/E3, E4, final reset done).
**Only the E1 blind HUMAN score is pending**: score `eval/results/exp1_blind_sheet_test.csv`
(24 answers, column `your_score_0_1_2`), then run
`python run_exp1_memory_onoff.py --unblind --test` (needs no DB or API).
Each test experiment was run exactly once. Nothing was tuned after seeing test results.

## 0. Provenance

| Item | Value |
|---|---|
| Git commit (base) | `f9eb84c11baea62c6c641ca2ca3eab5a15fcbdab` (working tree has UNCOMMITTED eval changes + the local waypoint fix; nothing committed, pushed or deployed) |
| Generation / extraction LLM | `gpt-4o-mini` (E1 answers, worthiness, extraction, summaries) |
| Embedding model | `text-embedding-3-small`, 1536 dims (API and E2 raw baseline use the same model) |
| API | local uvicorn, `EVAL_MODE=true`, no Redis, no Firebase; DB = separate eval Supabase project (Postgres 17 + pgvector). Started from a scratch cwd so `api/.env` (production) was never loaded |
| Python | 3.12.8, `eval/.venv` |
| Relevance metric | keyword-group substring match (`eval/lib/metrics.py`), UNCHANGED from the pilot. Audited: 0 substring-only false matches in all dev retrieved texts |

## 1. Corpus (frozen before any test query was run)

| Item | Value |
|---|---|
| Conversations | 36 = 10 original (`conv01..10`) + 26 distractors (`dist01..26`) |
| Memories extracted | **117** (first ingest on the buggy code gave 115; LLM extraction is not deterministic) |
| Sources / processing logs | 36 / 36; 0 still processing; worthiness gate rejected 0 |
| Waypoints | **72** rows linking **77 of 117** memories (weights 0.50 to 0.82, mean 0.59) |
| Entities | 0 (see section 3) |
| Dev queries | 6 (each with a paraphrase, so 12 retrieval trials) |
| Test queries | 12 (each with a paraphrase, so 24 retrieval trials) |
| Test queries / original conversations changed | none (`queries_test.json` and the 10 original conversations untouched) |

Distractor design: 26 synthetic conversations, topically close to the dev/test categories
(other editors, other languages, a cousin's allergy, other colleges for friends, other
trips, other databases/frameworks, other anniversaries, other cars/pets). A script verified
that none contains any dev or test answer keyword (21 keywords, same normalisation as
`metrics.py`).

## 2. Waypoint bug found and fixed (local only)

**Finding.** `api/app/api/ingest.py` called `create_waypoint_for_memory(wp_session, mid, owner_id)`
at three sites (`/ingest/text`, `/ingest/chat`, `/ingest/document` background tasks). The function
requires `(session, new_memory_id, new_embedding, user_id)`, so every call raised `TypeError`,
which was caught and logged. Result: **no waypoints were ever created through `/ingest/*`** (and so
none through the browser extension). The MCP `save` path uses the correct helper and was unaffected.
The call would also have failed even with the right arguments (it did `total += <list>`).
First ingest on the unfixed code: 115 memories, **0 waypoints**.

**Consequence for the numbers (corrected).** The fix did NOT change any retrieval result. In
`core/search.py` the waypoint term `w` is only non-zero when graph expansion runs, and expansion
only runs when fewer than `limit` candidates were returned. The vector pool is `min(2*limit,30)`
= 10 for `limit`=5, so expansion never triggers once the user has at least 5 memories, with or
without waypoints in the table. The paper already states this. (An earlier version of this note,
and the advice that preceded the fix, implied the bug affected the hybrid-vs-cosine comparison;
it did not. The fix matters for the stored graph / visualization, not for these metrics.)

**Fix.** The three call sites now call the existing `create_waypoints_background(session_factory,
memory_ids, embeddings, user_id)` helper (the one the MCP save path uses), passing the embeddings
already computed. 20 insertions, 32 deletions, one file. Diff: `eval/results/waypoint_fix.diff`.
After the fix and a reset + re-ingest: 72 waypoints, 0 waypoint errors in the API log.
**Not committed, pushed or deployed.** Production still has the bug.

No test query had been run when the fix was made, so the one-shot test protocol is intact.

## 3. Why entities are zero (cause only, not fixed)

Entity extraction (`EntityExtractor`) is only invoked from `_process_text_background`
(`/ingest/text`). `_process_chat_background` (`/ingest/chat`, which the harness uses) and
`_process_document_background` have no entity step at all. So 0 entities is expected for this
corpus, not an error. The `entities` / `memory_entities` tables are therefore unused by E1 to E4.

## 4. DEV results on the expanded corpus (36 convs, 117 memories, 72 waypoints)

Dev is for sanity checking only; it differs from the pilot because the corpus is ~3.6x larger.

### E3 dev (6 queries x 2 phrasings = 12 trials)

| Subset | Mode | hit@1 | hit@3 | hit@5 | MRR |
|---|---|---|---|---|---|
| all | cosine | 0.50 | 0.67 | 0.83 | 0.625 |
| all | lexical | 0.58 | 0.75 | 0.83 | 0.655 |
| all | hybrid | 0.58 | 0.75 | 0.83 | 0.660 |
| exact | cosine | 0.67 | 0.67 | 1.00 | 0.750 |
| exact | lexical | 0.83 | 0.83 | 1.00 | 0.867 |
| exact | hybrid | 0.83 | 0.83 | 1.00 | 0.875 |
| paraphrased | cosine | 0.33 | 0.67 | 0.67 | 0.500 |
| paraphrased | lexical | 0.33 | 0.67 | 0.67 | 0.444 |
| paraphrased | hybrid | 0.33 | 0.67 | 0.67 | 0.444 |

Pilot (6 dev queries, 31 memories) for reference: hit@1 cosine 6/12 vs hybrid 9/12; MRR 0.715 vs 0.861.
Dev misses: d01 and d03 paraphrases (no hit in top 5 for any mode), d06 only at rank 3 to 5.

### E2 dev (n=6)

| Side | hit@1 | hit@3 | hit@5 | MRR | mean tokens injected |
|---|---|---|---|---|---|
| structured | 0.83 | 0.83 | 1.00 | 0.875 | 54.2 |
| raw-chat RAG | 0.83 | 0.83 | 0.83 | 0.833 | 89.3 |

Pilot: hit@1 5/6 both, MRR 0.917, tokens 55.2 vs 86.8.

### E1 dev (n=6, automated keyword rubric 0/1/2, max 2)

| Prompt version | OFF | ON |
|---|---|---|
| v0 (original system prompt) | 0.00 | **0.33** |
| v1 (current, see below) | 0.00 | **1.67** |

Per query (v1): ON = 2 for d01, d02, d04, d05, d06; **d03 = 0**. OFF = 0 for all (every OFF answer
was "I don't have that information", as expected for a stateless model).
d03 fails because the stored memory is "User's project backend is built with FastAPI" and does
not name UniMemory, so the generator cannot tie it to the question. That is a real
memory-content limitation (extraction dropped the project name), not a harness bug.
Dev human blind scoring was not done (dev blind sheet is kept but unscored).

**Dev-stage harness bug fixed in E1 (disclosed).** With v0, retrieval was correct (answer present
in the retrieved memories for 5 of 6 queries) but ON scored 0.33. Cause: this run's extraction
wrote memories as "User ...", the question says "Alex", and the model refused. The system prompt
was changed once, for both conditions, to state that the user is Alex and that notes about
"the user" are about Alex (`run_exp1_memory_onoff.py`). Only that one change was made.
v0 outputs are kept as `exp1_*_dev_prompt_v0.csv`. This was decided on dev data only; no test
query has been seen.

## 5. Script / code changes made (all disclosed)

| File | Change | Why |
|---|---|---|
| `eval/data/personas.json` | +26 distractor conversations (append-only; originals untouched) | harder corpus |
| `eval/lib/client.py` | `memory_count()` pages through `/memories` (API caps limit at 100) | corpus > 100 memories would have stopped the settle-wait at 100 |
| `eval/run_exp1/2/3_*.py` | extra audit columns with the retrieved top-5 texts (not scored) | allows false-match audits without re-running the test set |
| `eval/run_exp1_memory_onoff.py` | system prompt v1 (see E1 dev) | dev-stage harness bug |
| `api/app/api/ingest.py` | waypoint call fix at 3 sites (`eval/results/waypoint_fix.diff`) + `/ingest/text` NameError fix (section 11). Full current diff: `eval/results/api_changes.diff` | sections 2 and 11; local only |

Scoring weights, retrieval code and test queries were not changed.

## 6. Failed or repeated runs

| Run | What happened |
|---|---|
| Ingest #1 | 115 memories, 0 waypoints (bug). Reset and re-ingested after the fix, before any dev/test experiment. |
| E1 dev #1 (prompt v0) | ON 0.33 because of the prompt bug. Re-run once with prompt v1 (1.67). |
| API restart | local API restarted once to load the fixed code. |
| Test E1/E2/E3, E4 | each ran once, exit 0, no crashes, no reruns. |

## 7. TEST results (12 test queries x 2 phrasings; run once; corpus 36 convs / 117 memories / 72 waypoints at ingest)

Audit: 0 substring-only false keyword matches in any retrieved text (E2 + E3 test).

### E3 test: retrieval ablation (all three modes rerank the same top-min(2*limit,30) pgvector pool)

| Subset | Mode | hit@1 | hit@3 | hit@5 | MRR |
|---|---|---|---|---|---|
| all (24 trials) | cosine | **0.62** (15/24) | 0.83 | 0.88 | **0.719** |
| all | lexical | 0.54 (13/24) | 0.88 | 0.92 | 0.689 |
| all | hybrid | 0.58 (14/24) | 0.88 | 0.92 | **0.719** |
| exact (12) | cosine | **0.58** (7/12) | 0.83 | 0.83 | 0.680 |
| exact | lexical | 0.42 (5/12) | 0.92 | 0.92 | 0.625 |
| exact | hybrid | 0.42 (5/12) | 0.92 | 0.92 | 0.639 |
| paraphrased (12) | cosine | 0.67 (8/12) | 0.83 | 0.92 | 0.757 |
| paraphrased | lexical | 0.67 (8/12) | 0.83 | 0.92 | 0.753 |
| paraphrased | hybrid | **0.75** (9/12) | 0.83 | 0.92 | **0.799** |

**Hybrid does NOT beat cosine on the test set.** Overall MRR is identical (0.719); hybrid is one
trial worse at hit@1 (14 vs 15 of 24) and one trial better at hit@3 and hit@5. The differences
are within one trial, so with n=24 nothing separates the modes. On exact-phrasing queries hybrid
is worse at hit@1 (0.42 vs 0.58); on paraphrased queries hybrid is nominally better
(0.75 vs 0.67 hit@1, MRR 0.799 vs 0.757), again by one trial. Pilot (31 memories) had
hybrid 9/12 vs cosine 6/12 hit@1; that advantage did not reproduce on the larger corpus
(dev: 0.58 vs 0.50, small).
Misses: t03 is a miss for ALL modes (both phrasings); t10 exact is a miss for cosine only.

### E2 test: structured memories vs raw-chat RAG (n=12 queries)

| Side | hit@1 | hit@3 | hit@5 | MRR | mean tokens injected |
|---|---|---|---|---|---|
| structured (UniMemory) | 0.42 | 0.92 | 0.92 | 0.639 | **50.5** |
| raw-chat RAG (message chunks) | **0.75** | 0.92 | 0.92 | **0.833** | 84.8 |

Structured retrieval uses ~40% fewer tokens (50.5 vs 84.8), with equal hit@3 and hit@5, but
**ranks the answer lower**: hit@1 0.42 vs 0.75 and MRR 0.639 vs 0.833. Per query: raw ranks the
answer first while structured ranks it 2nd or 3rd on t01 (2 vs 1), t04 (2 vs 1), t09 (3 vs 1) and
t10 (2 vs 1); both place it at rank 1 on t02, t05, t06, t08, t12 and tie at rank 2 on t07.
Each approach misses one query in the top 5: structured misses t03 (raw has it at rank 2); raw
misses t11 (structured has it at rank 3).
So the claim supported is "similar recall@3 at lower token cost", NOT "better ranking".

### E1 test: memory OFF vs ON (n=12; automated keyword rubric, 0/1/2, max 2)

| Condition | Auto rubric mean |
|---|---|
| OFF (stateless) | **0.00** |
| ON (top-5 memories injected) | **1.33** |
| Blind human score | **PENDING** (you score `exp1_blind_sheet_test.csv`, then run `--unblind --test`) |

Per query (auto, ON): t01 2, t02 2, t03 **0**, t04 **0**, t05 **0**, t06 2, t07 2, t08 2, t09 2,
t10 2, t11 2, t12 **0**. OFF = 0 for all 12 (every OFF answer is "I don't have that information").
8 of 12 correct, 4 failed (dev was 1.67; test is lower, 1.33).

Why the 4 queries failed (from `retrieved_top5` in `exp1_memory_onoff_test.csv`):
- **t03 (database)**: retrieval miss. The correct memory exists ("User's project uses PostgreSQL
  with the pgvector extension for vector search.") but does NOT name "UniMemory", so the top 5 were
  four other UniMemory-named memories (team, mentor, demo video, report) plus "User used a MySQL
  database for the dashboards" (from a distractor). The generator then answered **MySQL**, a
  confident wrong answer caused by a distractor. Root cause: extraction dropped the project name
  (coreference loss), so the fact is not findable by the query's key term. This is also the E3
  miss for all modes and the E2 structured miss.
- **t04 (sister), t05 (anniversary), t12 (cat)**: retrieval was fine (the answer was at rank 2, 1
  and 1) but the answer was "I don't have that information". In all three, the retrieved set also
  contained wrongly extracted memories "User's name is Maya" and/or "User's name is Rohan"
  (the extractor attributed a girlfriend's/friend's name to the user; 2 such memories in the corpus,
  both from distractor conversations), which conflict with the persona "Alex". The generator
  likely refused because of this conflict. That is a hypothesis from these three cases, not a
  controlled test. Separately, **0 of 117 memories contain the word "Alex"** (all say "User"), so
  the name in the query cannot help retrieval.

Blinding caveat: every OFF answer is the same refusal string, so the OFF/ON identity is trivially
guessable from the blind sheet. Human scoring will mostly confirm the automated rubric; say so
in the paper.

## 8. E4: latency and dedup

**Setup: local API (uvicorn, EVAL_MODE on) on the dev machine + REMOTE Supabase database + OpenAI
for query embeddings. Not Railway**, so numbers include the machine-to-Supabase network latency
and exclude Railway-to-Supabase. Production-default searches (reinforcement ON).

| Condition | n | mean (ms) | p50 (ms) | p95 (ms) | min | max |
|---|---|---|---|---|---|---|
| cold (distinct query + nonce, embedding not cached) | 36 | 1781 | 1675 | 2028 | 1487 | 5042 |
| warm (one fixed query repeated, embedding cached) | 30 | 1450 | 1344 | 2299 | 1058 | 3364 |

n=36 for cold (18 test+dev queries x 2 phrasings) because that is what the script runs; warm n=30.
Caching the embedding saves only ~330 ms on the mean (~19%), and warm p95 is above cold p95, so
the embedding round trip is not the main cost. Most of the ~1.4 s is probably database round
trips over the WAN to Supabase, but this was NOT profiled. Do not quote these as production latency.

| Dedup case (SimHash, Hamming <= 3, via `/memories`) | Input | Collapsed into base? |
|---|---|---|
| exact duplicate | "Alex's favorite color is teal." | **Yes** |
| near duplicate (spelling variant) | "Alex's favourite colour is teal." | **No** |
| distinct | "Alex's lucky number is seventeen." | No (correct) |

SimHash catches exact repeats but not a spelling variant (favorite/favourite, color/colour). The
paper should say dedup is lexical, not semantic.

Note: E4 uses production-default searches, which fire reinforcement. The waypoint count at the very
end of the run was 336 (72 right after ingest). I did not investigate why it grew; it happened
AFTER all test queries (E1 to E3 use `reinforce=False`, so test results were not affected).

## 9. Cleanup

- `reset_test_data.py` run at the end: eval user has 0 memories and 0 sources. The persona memories
  were exported first to `eval/results/corpus_memories_dump.csv` (117 rows) so failure analysis
  can refer to exact memories (extraction is not deterministic, so a re-ingest will differ).
- Local API stopped. The eval user row and API key remain in the eval DB; `eval/.eval_key` was
  rewritten by setup (gitignored).
- Nothing committed, pushed or deployed. `paper/` untouched.

## 10. Plain-language summary

1. Corpus: 36 conversations, 117 extracted memories, 6 dev and 12 test queries (24 test trials with paraphrases).
2. A real bug was found: ingest never created waypoint links (wrong function arguments). I fixed it locally and re-ingested before any test query; production still has it.
3. E1: memory helps a lot: stateless 0.00 vs memory 1.33 out of 2 (8 of 12 right; human score pending).
4. E1 failures come from extraction quality (a dropped project name, and "User's name is Maya" errors), not from the retrieval ranking alone.
5. E2: structured memories use ~40% fewer tokens (50.5 vs 84.8) with the same hit@3/@5 (0.92).
6. E2: but structured retrieval ranks the answer lower than raw-chat RAG (hit@1 0.42 vs 0.75; MRR 0.64 vs 0.83).
7. E3: **hybrid does not beat cosine on the test set**: MRR 0.719 vs 0.719, hit@1 0.58 vs 0.62, all differences within one trial.
8. The pilot's hybrid advantage (9/12 vs 6/12) did not reproduce on the larger corpus; the paper should not claim it.
9. E4 (local API + remote DB): about 1.8 s cold and 1.45 s warm mean; dedup catches exact repeats but not spelling variants.
10. Limits: one synthetic persona, one LLM, 12 test queries, keyword-based relevance, hand-set weights; differences of one trial are noise.

## 11. Second production bug found after the evaluation: `/ingest/text` stored nothing

Found while testing the waypoint fix on all three ingest paths (against the EVAL database, not
production). The evaluation itself used `/ingest/chat`, so no reported number is affected.

- **Symptom:** `POST /ingest/text` returns 200 and a "Processing..." source, but the background task
  fails with `NameError: name 'get_sector_decay_lambda' is not defined`; no memories are stored,
  the source title stays "Processing...", and no processing-log row is written.
- **Cause:** commit `68c64e0` (schema cleanup, 2026-04-24) removed the columns `decay_lambda`,
  `memory_type`, `priority` and the import of `get_sector_decay_lambda`, and updated the chat,
  document and `store_extracted_memories` paths, but not `_process_text_background`, which still
  called the removed helpers and appended a 7-item tuple that it later unpacked as 4 items.
- **Impact (deployed code):** SDK `ingestText` (the paper's Listing 1) and the browser extension's
  "save selected text" call this endpoint, so both silently fail in production today.
  `/ingest/chat` (extension "save whole chat"), `/ingest/document`, `/memories` and MCP `save` work.
- **Fix (local, uncommitted):** the text path now uses the same 4-item tuple as the chat path
  (3 lines removed). Verified: 5 memories stored, source title filled in, no errors.
- **Other paths re-verified with the fixed code (eval DB):** `/ingest/chat` (4 memories, waypoints
  created) and a two-chunk `/ingest/document` (23 memories, no errors; embeddings accumulated
  correctly across chunks). A static undefined-name check over all of `api/app` found nothing else.
- Waypoints for the text test were legitimately 0: the five memories' pairwise cosine was at most
  0.41, below the 0.50 threshold; the waypoint step ran for all five.
- Test data was removed from the eval DB afterwards (`reset_test_data.py`).
