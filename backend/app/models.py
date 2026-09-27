from typing import Optional
from pydantic import BaseModel


class User(BaseModel):
    id: str
    handle: str
    name: str
    bio: Optional[str] = None


class UserCreate(BaseModel):
    id: Optional[str] = None
    handle: str
    name: str
    bio: Optional[str] = None


class UserUpdate(BaseModel):
    handle: Optional[str] = None
    name: Optional[str] = None
    bio: Optional[str] = None


class Place(BaseModel):
    id: str
    kind: str = "building"
    name: str
    architect: Optional[str] = None
    year: Optional[int] = None
    typology: Optional[str] = None
    style: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    osm: Optional[str] = None
    qid: Optional[str] = None
    image: Optional[str] = None
    credit: Optional[str] = None
    blurb: Optional[str] = None
    wiki: Optional[str] = None
    source: str = "user"
    added_by: Optional[str] = None
    created_at: Optional[str] = None


class PlaceCreate(BaseModel):
    id: Optional[str] = None
    kind: str = "building"
    name: str
    architect: Optional[str] = None
    year: Optional[int] = None
    typology: Optional[str] = None
    style: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    osm: Optional[str] = None
    qid: Optional[str] = None
    added_by: Optional[str] = None


class Visit(BaseModel):
    id: str
    user_id: str
    place_id: str
    stars: int
    note: Optional[str] = None
    likes: list[str] = []
    photos: list[str] = []
    visited_on: Optional[str] = None
    created_at: str


class VisitCreate(BaseModel):
    user_id: str
    place_id: str
    stars: int
    note: Optional[str] = None
    likes: list[str] = []
    photos: list[str] = []
    visited_on: Optional[str] = None


class FollowCreate(BaseModel):
    follower_id: str
    followee_id: str


class WantCreate(BaseModel):
    user_id: str
    place_id: str


class ListCreate(BaseModel):
    id: Optional[str] = None
    name: str
    owner_id: str


class ListItemCreate(BaseModel):
    place_id: str
    added_by: str


class StateDump(BaseModel):
    users: list[dict]
    places: list[dict]
    visits: list[dict]
    follows: list[list[str]]
    want: list[dict]
    lists: list[dict]
