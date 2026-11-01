"""
Ingest the synthetic persona corpus into the eval user's account via the
structured pipeline (/ingest/chat), then wait for background extraction to
settle.

Run after setup_test_user.py + reset_test_data.py:

    python ingest_dataset.py
"""
import json
import time

import config
from lib.client import UniMemoryClient


def main() -> None:
    data = json.loads(config.PERSONAS_FILE.read_text())
    end_user = data["persona"]["end_user_id"]
    client = UniMemoryClient()

    convs = data["conversations"]
    print(f"Ingesting {len(convs)} conversations for end_user='{end_user}'...")
    for conv in convs:
        resp = client.ingest_chat(
            messages=conv["messages"],
            end_user=end_user,
            source_id=conv["id"],
        )
        print(f"  {conv['id']}: source_id={resp.get('source_id', '?')}")
        time.sleep(1.0)  # be gentle on the LLM extraction queue

    print(f"\nWaiting up to {config.INGEST_SETTLE_SECONDS}s for extraction...")
    count = client.wait_for_memories(end_user, config.INGEST_SETTLE_SECONDS)
    print(f"Extraction settled. Memory count for end_user: {count}")
    print("\nIf the count looks low, the worthiness gate or extraction may still")
    print("be running. Re-check with a longer EVAL_INGEST_SETTLE and re-run the")
    print("experiments (do NOT re-ingest without reset_test_data.py first).")


if __name__ == "__main__":
    main()
