"""Standalone schema bootstrap.

We deliberately keep `db.create_all()` OUT of `app.py` so that starting
the server is deterministic — it doesn't silently mutate the database.
Run this once after bringing Postgres up:

    python init_db.py
"""
from app import app
from extensions import db
# Import models so SQLAlchemy registers them on the metadata
import models  # noqa: F401


def main():
    with app.app_context():
        db.create_all()
        print("Created tables:", sorted(db.metadata.tables.keys()))


if __name__ == "__main__":
    main()
