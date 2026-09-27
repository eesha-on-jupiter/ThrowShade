"""Seed the SQLite backend from app/data.js (via seed_data.json).

Run: python backend/scripts/extract_data_js.js   (regenerates seed_data.json)
     python backend/seed.py
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.db import get_connection, init_db

SEED_PATH = Path(__file__).resolve().parent / "seed_data.json"

# Only the throwShade team signs in for this demo — the other app/data.js
# seed users (u-mara, u-theo, u-priya, u-jonah) are fictional "critics" used
# for design mockups and aren't wanted in the backend.
KEEP_USER_IDS = {"u-eesha", "u-shandon", "u-achyuth", "u-yenhsing"}

# Presentation content: real ratings for the team, so a fresh clone shows the
# same populated feed/map/profiles as this machine's demo run rather than an
# empty backend. hours_ago spreads them out so the feed has a real order.
DEMO_VISITS = [
    ("u-eesha", "salk", 5, "The light in that courtyard is unreal at golden hour.", ["Light", "Material", "Context"], 6),
    ("u-eesha", "therme-vals", 5, "Stone, steam, silence. Rebooked immediately.", ["Material", "Interior", "Vibes"], 30),
    ("u-eesha", "kimbell", 4, "Those cycloid vaults do something to the light.", ["Light", "Space"], 54),
    ("u-eesha", "pompidou", 4, "Chaotic outside, honest inside.", ["Structure", "Facade"], 80),
    ("u-shandon", "lloyds", 5, "The best plumbing diagram ever built.", ["Engineering", "Facade", "Detail"], 4),
    ("u-shandon", "hsbc-hk", 5, "Foster's kit of parts, executed perfectly.", ["Structure", "Engineering"], 28),
    ("u-shandon", "cctv", 4, "The cantilever is unreasonable and I respect it.", ["Structure", "Scale"], 52),
    ("u-shandon", "habitat-67", 4, "Modular housing that actually shipped.", ["Structure", "Material"], 76),
    ("u-achyuth", "chrysler", 5, "Hubcaps as gargoyles. Unbeatable.", ["Facade", "Detail", "Craft"], 3),
    ("u-achyuth", "empire-state", 5, "Still the best-dressed building in Midtown.", ["Facade", "Scale"], 27),
    ("u-achyuth", "grand-central", 4, "The ceiling alone is worth the trip.", ["Interior", "Craft"], 51),
    ("u-achyuth", "flatiron", 4, "New York's first icon.", ["Facade", "Context"], 75),
    ("u-yenhsing", "farnsworth", 5, "Mies distilled a house down to a single thought.", ["Design", "Material", "Space"], 5),
    ("u-yenhsing", "barcelona-pavilion", 5, "Floating planes, still radical.", ["Design", "Space"], 29),
    ("u-yenhsing", "glass-house", 4, "Beautiful, but where do you put your socks.", ["Design", "Context"], 53),
    ("u-yenhsing", "villa-savoye", 4, "The five points, textbook and gorgeous.", ["Design", "Structure"], 77),
]
DEMO_WANT = [
    ("u-eesha", "sagrada-familia"), ("u-eesha", "church-of-light"),
    ("u-shandon", "heydar-aliyev"), ("u-shandon", "seattle-library"),
    ("u-achyuth", "sagrada-familia"), ("u-achyuth", "villa-savoye"),
    ("u-yenhsing", "therme-vals"), ("u-yenhsing", "unite"),
]
DEMO_LIST = {
    "id": "l-nyc-crawl", "name": "NYC architecture crawl", "owner_id": "u-eesha",
    "members": ["u-eesha", "u-shandon", "u-achyuth"],
    "items": [("seagram", "u-eesha"), ("chrysler", "u-achyuth"), ("lever-house", "u-shandon")],
}


def seed_demo_content(conn, now) -> None:
    for user_id, place_id, stars, note, likes, hours_ago in DEMO_VISITS:
        created_at = (now - timedelta(hours=hours_ago)).isoformat()
        conn.execute(
            """INSERT OR IGNORE INTO visits
               (id, user_id, place_id, stars, note, likes, photos, visited_on, created_at)
               VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?)""",
            (f"v-{user_id}-{place_id}", user_id, place_id, stars, note, json.dumps(likes), created_at, created_at),
        )
    for user_id, place_id in DEMO_WANT:
        conn.execute(
            "INSERT OR IGNORE INTO want_to_visit (user_id, place_id, created_at) VALUES (?, ?, ?)",
            (user_id, place_id, now.isoformat()),
        )
    conn.execute(
        "INSERT OR IGNORE INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)",
        (DEMO_LIST["id"], DEMO_LIST["name"], DEMO_LIST["owner_id"], now.isoformat()),
    )
    for user_id in DEMO_LIST["members"]:
        conn.execute(
            "INSERT OR IGNORE INTO list_members (list_id, user_id) VALUES (?, ?)",
            (DEMO_LIST["id"], user_id),
        )
    for place_id, added_by in DEMO_LIST["items"]:
        conn.execute(
            "INSERT OR IGNORE INTO list_items (list_id, place_id, added_by, created_at) VALUES (?, ?, ?, ?)",
            (DEMO_LIST["id"], place_id, added_by, now.isoformat()),
        )


def load_seed() -> dict:
    with open(SEED_PATH, encoding="utf-8") as f:
        data = json.load(f)
    data["users"] = [u for u in data["users"] if u["id"] in KEEP_USER_IDS]
    data["visits"] = [v for v in data["visits"] if v[0] in KEEP_USER_IDS]
    data["want"] = [w for w in data["want"] if w[0] in KEEP_USER_IDS]
    data["lists"] = [l for l in data["lists"] if l["ownerId"] in KEEP_USER_IDS]
    for lst in data["lists"]:
        lst["members"] = [m for m in lst["members"] if m in KEEP_USER_IDS]
        lst["items"] = [it for it in lst["items"] if it[1] in KEEP_USER_IDS]
    return data


def main() -> None:
    init_db()
    data = load_seed()
    conn = get_connection()
    now = datetime.now(timezone.utc)

    try:
        for u in data["users"]:
            conn.execute(
                "INSERT OR IGNORE INTO users (id, handle, name, bio) VALUES (?, ?, ?, ?)",
                (u["id"], u["handle"], u["name"], u.get("bio")),
            )

        for b in data["buildings"]:
            conn.execute(
                """INSERT OR IGNORE INTO places
                   (id, kind, name, architect, year, typology, style, city, country,
                    lat, lng, source, created_at)
                   VALUES (?, 'building', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?)""",
                (
                    b["id"], b["name"], b.get("architect"), b.get("year"),
                    b.get("typology"), b.get("style"), b.get("city"), b.get("country"),
                    b.get("lat"), b.get("lng"), now.isoformat(),
                ),
            )

        # Only app/data.js buildings were loaded above (not the generated
        # app/wikidata.js Chicago set), so seed rows pointing at 'wd-Q...'
        # place ids are skipped here rather than seeded with a dangling
        # foreign key. Importing wikidata.js is a follow-up.
        known_place_ids = {b["id"] for b in data["buildings"]}
        skipped_visits = skipped_want = skipped_items = 0

        likes = data["likes"]
        for v in data["visits"]:
            user_id, place_id, stars, note, hours_ago = v
            if place_id not in known_place_ids:
                skipped_visits += 1
                continue
            created_at = (now - timedelta(hours=hours_ago)).isoformat()
            visit_likes = likes.get(f"{user_id}|{place_id}", [])
            conn.execute(
                """INSERT OR IGNORE INTO visits
                   (id, user_id, place_id, stars, note, likes, photos, visited_on, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?)""",
                (
                    f"v-{user_id}-{place_id}", user_id, place_id, stars, note,
                    json.dumps(visit_likes), created_at, created_at,
                ),
            )

        for w_user, w_place in data["want"]:
            if w_place not in known_place_ids:
                skipped_want += 1
                continue
            conn.execute(
                "INSERT OR IGNORE INTO want_to_visit (user_id, place_id, created_at) VALUES (?, ?, ?)",
                (w_user, w_place, now.isoformat()),
            )

        for lst in data["lists"]:
            created_at = (now - timedelta(hours=lst.get("hoursAgo", 0))).isoformat()
            conn.execute(
                "INSERT OR IGNORE INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)",
                (lst["id"], lst["name"], lst["ownerId"], created_at),
            )
            for member in lst.get("members", []):
                conn.execute(
                    "INSERT OR IGNORE INTO list_members (list_id, user_id) VALUES (?, ?)",
                    (lst["id"], member),
                )
            for place_id, added_by in lst.get("items", []):
                if place_id not in known_place_ids:
                    skipped_items += 1
                    continue
                conn.execute(
                    "INSERT OR IGNORE INTO list_items (list_id, place_id, added_by, created_at) VALUES (?, ?, ?, ?)",
                    (lst["id"], place_id, added_by, created_at),
                )

        # Seeded users follow each other so feeds aren't empty.
        user_ids = [u["id"] for u in data["users"]]
        for follower in user_ids:
            for followee in user_ids:
                if follower != followee:
                    conn.execute(
                        "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
                        (follower, followee),
                    )

        seed_demo_content(conn, now)

        conn.commit()
        counts = {
            table: conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()["c"]
            for table in ["users", "places", "visits", "follows", "want_to_visit", "lists", "list_items"]
        }
        print("Seeded:", counts)
        print(
            f"Skipped (referenced app/wikidata.js places not yet imported): "
            f"visits={skipped_visits}, want={skipped_want}, list_items={skipped_items}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
