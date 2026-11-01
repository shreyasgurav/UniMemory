"""
Create (or reuse) a dedicated, isolated evaluation user and mint an API key.

Why a dedicated user: so your real memories never enter the retrieval pool and
contaminate results. This user has a fixed fake firebase_uid and is only ever
touched by the eval harness.

Run from the eval/ directory with the API's environment active (DATABASE_URL
must point at the same DB the API uses):

    python setup_test_user.py

Writes the raw API key to eval/.eval_key (gitignored).
"""
import asyncio
import sys
from pathlib import Path

# Make the API package importable.
API_DIR = Path(__file__).resolve().parents[1] / "api"
sys.path.insert(0, str(API_DIR))

from sqlalchemy import select  # noqa: E402

import config  # noqa: E402
from app.db.database import AsyncSessionLocal  # noqa: E402
from app.db.models import User, APIKey  # noqa: E402
from app.core.security import generate_api_key  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as session:
        # Find or create the eval user.
        res = await session.execute(
            select(User).where(User.firebase_uid == config.TEST_USER_FIREBASE_UID)
        )
        user = res.scalar_one_or_none()
        if user is None:
            user = User(
                firebase_uid=config.TEST_USER_FIREBASE_UID,
                email=config.TEST_USER_EMAIL,
                display_name="UniMemory Eval Harness",
                account_type="api",
                plan="free",
                is_active=True,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            print(f"Created eval user {user.id} ({user.email})")
        else:
            print(f"Reusing eval user {user.id} ({user.email})")

        # Always mint a fresh API key for this run.
        plaintext_key, hashed_key = generate_api_key()
        api_key = APIKey(
            name="eval-harness",
            key_hash=hashed_key,
            key_prefix=plaintext_key[:15] + "...",
            user_id=user.id,
            is_active=True,
        )
        session.add(api_key)
        await session.commit()

        key_file = Path(__file__).resolve().parent / ".eval_key"
        key_file.write_text(plaintext_key)
        print(f"Wrote API key to {key_file}")
        print("Key prefix:", plaintext_key[:15] + "...")
        print("\nNext: python reset_test_data.py  (clean slate)")
        print("Then : python ingest_dataset.py   (load persona corpus)")


if __name__ == "__main__":
    asyncio.run(main())
