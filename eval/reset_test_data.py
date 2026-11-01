"""
Delete ALL memories/sources/entities/logs for the eval test user only.

Scoped strictly to the dedicated eval user (fixed firebase_uid), so it can
never touch your real account. The User row and its API key are kept.

Run between experiment runs for a clean DB:

    python reset_test_data.py
"""
import asyncio
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1] / "api"
sys.path.insert(0, str(API_DIR))

from sqlalchemy import select, delete  # noqa: E402

import config  # noqa: E402
from app.db.database import AsyncSessionLocal  # noqa: E402
from app.db.models import (  # noqa: E402
    User, Memory, Source, EndUser, Entity, ProcessingLog, ActivityLog,
)


async def main() -> None:
    async with AsyncSessionLocal() as session:
        res = await session.execute(
            select(User).where(User.firebase_uid == config.TEST_USER_FIREBASE_UID)
        )
        user = res.scalar_one_or_none()
        if user is None:
            print("No eval user found. Run setup_test_user.py first.")
            return

        owner_id = user.id
        # Memory and Source deletes cascade to waypoints, memory_sources,
        # entity_sources and memory_entities via FK ondelete=CASCADE.
        for model in (Memory, Source, Entity, ProcessingLog, ActivityLog, EndUser):
            col = model.user_id if model is ActivityLog else model.owner_id
            result = await session.execute(delete(model).where(col == owner_id))
            print(f"Deleted {result.rowcount or 0} rows from {model.__tablename__}")
        await session.commit()
        print(f"\nClean slate for eval user {owner_id}.")


if __name__ == "__main__":
    asyncio.run(main())
