import json
import sqlite3
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .db import get_connection, init_db
from .models import (
    FollowCreate,
    ListCreate,
    ListItemCreate,
    Place,
    PlaceCreate,
    User,
    UserCreate,
    UserUpdate,
    Visit,
    VisitCreate,
    WantCreate,
)

app = FastAPI(title="throwShade API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_place(row) -> dict:
    return dict(row)


def row_to_visit(row) -> dict:
    d = dict(row)
    d["likes"] = json.loads(d["likes"]) if d["likes"] else []
    d["photos"] = json.loads(d["photos"]) if d["photos"] else []
    return d


# ---------- users ----------

@app.post("/users", response_model=User)
def create_user(body: UserCreate):
    conn = get_connection()
    try:
        user_id = body.id or f"u-{uuid.uuid4().hex[:8]}"
        try:
            conn.execute(
                "INSERT INTO users (id, handle, name, bio) VALUES (?, ?, ?, ?)",
                (user_id, body.handle, body.name, body.bio),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            # Idempotent for sync retries: a client re-posting the same id or
            # handle just gets back the row that's already there.
            existing = conn.execute(
                "SELECT * FROM users WHERE id = ? OR handle = ?",
                (user_id, body.handle),
            ).fetchone()
            if existing:
                return dict(existing)
            raise HTTPException(status_code=409, detail="handle already taken")
        return {"id": user_id, **body.model_dump(exclude={"id"})}
    finally:
        conn.close()


@app.get("/users/{user_id}", response_model=User)
def get_user(user_id: str):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="user not found")
        return dict(row)
    finally:
        conn.close()


@app.put("/users/{user_id}", response_model=User)
def update_user(user_id: str, body: UserUpdate):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="user not found")
        updated = {**dict(row), **body.model_dump(exclude_unset=True)}
        conn.execute(
            "UPDATE users SET handle=?, name=?, bio=? WHERE id=?",
            (updated["handle"], updated["name"], updated["bio"], user_id),
        )
        conn.commit()
        return updated
    finally:
        conn.close()


# ---------- places ----------

@app.get("/places", response_model=list[Place])
def list_places(kind: str | None = None, city: str | None = None):
    conn = get_connection()
    try:
        query = "SELECT * FROM places WHERE 1=1"
        params: list = []
        if kind:
            query += " AND kind = ?"
            params.append(kind)
        if city:
            query += " AND city = ?"
            params.append(city)
        rows = conn.execute(query, params).fetchall()
        return [row_to_place(r) for r in rows]
    finally:
        conn.close()


@app.get("/places/{place_id}", response_model=Place)
def get_place(place_id: str):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="place not found")
        return row_to_place(row)
    finally:
        conn.close()


@app.post("/places", response_model=Place)
def create_place(body: PlaceCreate):
    conn = get_connection()
    try:
        place_id = body.id or f"pin-{uuid.uuid4().hex[:10]}"
        created = now()
        conn.execute(
            """INSERT OR IGNORE INTO places
               (id, kind, name, architect, year, typology, style, city, country,
                lat, lng, address, osm, qid, source, added_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)""",
            (
                place_id, body.kind, body.name, body.architect, body.year,
                body.typology, body.style, body.city, body.country,
                body.lat, body.lng, body.address, body.osm, body.qid,
                body.added_by, created,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
        return row_to_place(row)
    finally:
        conn.close()


# ---------- visits ----------

@app.get("/visits", response_model=list[Visit])
def list_visits(user_id: str | None = None, place_id: str | None = None):
    conn = get_connection()
    try:
        query = "SELECT * FROM visits WHERE 1=1"
        params: list = []
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)
        if place_id:
            query += " AND place_id = ?"
            params.append(place_id)
        query += " ORDER BY created_at DESC"
        rows = conn.execute(query, params).fetchall()
        return [row_to_visit(r) for r in rows]
    finally:
        conn.close()


@app.post("/visits", response_model=Visit)
def upsert_visit(body: VisitCreate):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM visits WHERE user_id = ? AND place_id = ?",
            (body.user_id, body.place_id),
        ).fetchone()
        created = now()
        likes_json = json.dumps(body.likes)
        photos_json = json.dumps(body.photos)
        if existing:
            visit_id = existing["id"]
            conn.execute(
                """UPDATE visits SET stars=?, note=?, likes=?, photos=?,
                   visited_on=?, created_at=? WHERE id=?""",
                (body.stars, body.note, likes_json, photos_json,
                 body.visited_on, created, visit_id),
            )
        else:
            visit_id = f"v-{uuid.uuid4().hex[:10]}"
            conn.execute(
                """INSERT INTO visits
                   (id, user_id, place_id, stars, note, likes, photos, visited_on, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (visit_id, body.user_id, body.place_id, body.stars, body.note,
                 likes_json, photos_json, body.visited_on, created),
            )
        conn.execute(
            "DELETE FROM want_to_visit WHERE user_id = ? AND place_id = ?",
            (body.user_id, body.place_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM visits WHERE id = ?", (visit_id,)).fetchone()
        return row_to_visit(row)
    finally:
        conn.close()


@app.delete("/visits/{visit_id}")
def delete_visit(visit_id: str):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM visits WHERE id = ?", (visit_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/visits")
def delete_visit_by_place(user_id: str, place_id: str):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM visits WHERE user_id = ? AND place_id = ?",
            (user_id, place_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- feed ----------

@app.get("/feed", response_model=list[Visit])
def feed(user_id: str, limit: int = 50):
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT v.* FROM visits v
               WHERE v.user_id IN (
                   SELECT followee_id FROM follows WHERE follower_id = ?
               )
               ORDER BY v.created_at DESC
               LIMIT ?""",
            (user_id, limit),
        ).fetchall()
        return [row_to_visit(r) for r in rows]
    finally:
        conn.close()


# ---------- follows ----------

@app.post("/follows")
def follow(body: FollowCreate):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (body.follower_id, body.followee_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/follows")
def unfollow(follower_id: str, followee_id: str):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?",
            (follower_id, followee_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- want to visit ----------

@app.get("/want")
def list_want(user_id: str):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT place_id, created_at FROM want_to_visit WHERE user_id = ?",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/want")
def add_want(body: WantCreate):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO want_to_visit (user_id, place_id, created_at) VALUES (?, ?, ?)",
            (body.user_id, body.place_id, now()),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/want")
def remove_want(user_id: str, place_id: str):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM want_to_visit WHERE user_id = ? AND place_id = ?",
            (user_id, place_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- lists ----------

@app.get("/lists")
def list_lists(user_id: str):
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT DISTINCT l.* FROM lists l
               LEFT JOIN list_members m ON m.list_id = l.id
               WHERE l.owner_id = ? OR m.user_id = ?""",
            (user_id, user_id),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/lists")
def create_list(body: ListCreate):
    conn = get_connection()
    try:
        list_id = body.id or f"l-{uuid.uuid4().hex[:8]}"
        created = now()
        conn.execute(
            "INSERT OR IGNORE INTO lists (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)",
            (list_id, body.name, body.owner_id, created),
        )
        conn.execute(
            "INSERT OR IGNORE INTO list_members (list_id, user_id) VALUES (?, ?)",
            (list_id, body.owner_id),
        )
        conn.commit()
        return {"id": list_id, "name": body.name, "owner_id": body.owner_id, "created_at": created}
    finally:
        conn.close()


@app.post("/lists/{list_id}/items")
def add_list_item(list_id: str, body: ListItemCreate):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO list_items (list_id, place_id, added_by, created_at) VALUES (?, ?, ?, ?)",
            (list_id, body.place_id, body.added_by, now()),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.get("/lists/{list_id}/items")
def get_list_items(list_id: str):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM list_items WHERE list_id = ?", (list_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.delete("/lists/{list_id}/items")
def delete_list_item(list_id: str, place_id: str):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM list_items WHERE list_id = ? AND place_id = ?",
            (list_id, place_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- bulk state (frontend bootstrap) ----------

@app.get("/state")
def get_state():
    """Full dump shaped to match the frontend's in-memory `state` object
    (see app/app.js), so a fresh browser can hydrate straight from it
    instead of reseeding its own independent copy of app/data.js."""
    conn = get_connection()
    try:
        users = [dict(r) for r in conn.execute("SELECT * FROM users").fetchall()]
        places = []
        for p in conn.execute("SELECT * FROM places").fetchall():
            place = dict(p)
            place["addedBy"] = place.pop("added_by")
            place["createdAt"] = place.pop("created_at")
            places.append(place)
        visits = [
            {
                "id": v["id"], "userId": v["user_id"], "buildingId": v["place_id"],
                "stars": v["stars"], "note": v["note"],
                "likes": json.loads(v["likes"]) if v["likes"] else [],
                "photos": json.loads(v["photos"]) if v["photos"] else [],
                "visitedOn": v["visited_on"], "createdAt": v["created_at"],
            }
            for v in conn.execute("SELECT * FROM visits").fetchall()
        ]
        follows = [
            [f["follower_id"], f["followee_id"]]
            for f in conn.execute("SELECT * FROM follows").fetchall()
        ]
        want = [
            {"userId": w["user_id"], "buildingId": w["place_id"], "createdAt": w["created_at"]}
            for w in conn.execute("SELECT * FROM want_to_visit").fetchall()
        ]
        lists = []
        for l in conn.execute("SELECT * FROM lists").fetchall():
            members = [
                m["user_id"] for m in conn.execute(
                    "SELECT user_id FROM list_members WHERE list_id = ?", (l["id"],)
                ).fetchall()
            ]
            items = [
                {"buildingId": it["place_id"], "addedBy": it["added_by"], "createdAt": it["created_at"]}
                for it in conn.execute(
                    "SELECT * FROM list_items WHERE list_id = ?", (l["id"],)
                ).fetchall()
            ]
            lists.append({
                "id": l["id"], "name": l["name"], "ownerId": l["owner_id"],
                "members": members, "items": items, "createdAt": l["created_at"],
            })
        return {
            "users": users, "places": places, "visits": visits,
            "follows": follows, "want": want, "lists": lists,
        }
    finally:
        conn.close()
