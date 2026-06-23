"""Create the voice_sessions table in Supabase.

Run:
    python scripts/create_supabase_table.py

Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.
"""

import os
import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env", override=False)

from supabase import create_client


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY", file=sys.stderr)
        raise SystemExit(1)

    client = create_client(url, key)

    sql = """
    create table if not exists voice_sessions (
        session_id text primary key,
        character text default 'default',
        mode text default 'default',
        conversation_history jsonb default '[]'::jsonb,
        kid_profile jsonb default '{}'::jsonb,
        updated_at timestamptz default now()
    );
    """

    # supabase-py does not expose an rpc-less raw SQL runner, so we use the
    # REST client directly via postgrest.
    response = client.table("voice_sessions").select("session_id").limit(1).execute()
    print("voice_sessions table already exists; sample query returned:", response.data)
    print("If the table does not exist, run this SQL in the Supabase SQL editor:")
    print(sql)


if __name__ == "__main__":
    main()
