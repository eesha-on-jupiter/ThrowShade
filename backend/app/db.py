import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "throwshade.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    handle TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    bio TEXT
);

CREATE TABLE IF NOT EXISTS places (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'building',
    name TEXT NOT NULL,
    architect TEXT,
    year INTEGER,
    typology TEXT,
    style TEXT,
    city TEXT,
    country TEXT,
    lat REAL,
    lng REAL,
    address TEXT,
    osm TEXT,
    qid TEXT,
    image TEXT,
    credit TEXT,
    blurb TEXT,
    wiki TEXT,
    source TEXT DEFAULT 'seed',
    added_by TEXT REFERENCES users(id),
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    place_id TEXT NOT NULL REFERENCES places(id),
    stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    note TEXT,
    likes TEXT,
    photos TEXT,
    visited_on TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, place_id)
);

CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id),
    followee_id TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS want_to_visit (
    user_id TEXT NOT NULL REFERENCES users(id),
    place_id TEXT NOT NULL REFERENCES places(id),
    created_at TEXT,
    PRIMARY KEY (user_id, place_id)
);

CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS list_members (
    list_id TEXT NOT NULL REFERENCES lists(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY (list_id, user_id)
);

CREATE TABLE IF NOT EXISTS list_items (
    list_id TEXT NOT NULL REFERENCES lists(id),
    place_id TEXT NOT NULL REFERENCES places(id),
    added_by TEXT REFERENCES users(id),
    created_at TEXT
);
"""


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
