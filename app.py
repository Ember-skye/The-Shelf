"""
The Shelf — local anime/movie collection tracker
Run with: python app.py
Then open http://127.0.0.1:5000 in your browser.

Every collection has its own folder under ./data:
  data/anime/library.json and data/anime/posters/
  data/movies/library.json and data/movies/posters/
"""
import json
import shutil
import threading
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, abort
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
COLLECTIONS = ("anime", "movies", "cartoons", "series")
LEGACY_LIBRARY_FILE = DATA_DIR / "library.json"
LEGACY_UPLOADS_DIR = DATA_DIR / "uploads"
ALLOWED_EXT = {"png", "jpg", "jpeg", "webp", "gif"}
MAX_UPLOAD_MB = 8

DATA_DIR.mkdir(exist_ok=True)
for collection in COLLECTIONS:
    (DATA_DIR / collection / "posters").mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
_lock = threading.Lock()


def collection_key(kind):
    if kind not in COLLECTIONS:
        abort(404, description="Unknown collection type")
    return kind


def collection_dir(kind):
    return DATA_DIR / collection_key(kind)


def library_file(kind):
    return collection_dir(kind) / "library.json"


def posters_dir(kind):
    return collection_dir(kind) / "posters"


def _read_json(path, default):
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return default


def _write_json(path, data):
    tmp_path = path.with_suffix(".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    tmp_path.replace(path)


def migrate_legacy_storage():
    """Split the original shared library/upload directory on the first run."""
    if not LEGACY_LIBRARY_FILE.exists():
        return

    legacy_data = _read_json(LEGACY_LIBRARY_FILE, {})
    for kind in COLLECTIONS:
        entries = legacy_data.get(kind, [])
        if not isinstance(entries, list):
            entries = []

        for entry in entries:
            poster = entry.get("poster") or ""
            if not poster:
                continue
            filename = Path(poster).name
            source = LEGACY_UPLOADS_DIR / filename
            destination = posters_dir(kind) / filename
            if source.exists() and not destination.exists():
                shutil.move(str(source), str(destination))
            entry["poster"] = f"data/{kind}/posters/{filename}"

        _write_json(library_file(kind), entries)

    # The old JSON is no longer needed once both collection files are written.
    LEGACY_LIBRARY_FILE.unlink()
    try:
        LEGACY_UPLOADS_DIR.rmdir()  # Retain it if it contains unclassified files.
    except OSError:
        pass


def load_library(kind):
    data = _read_json(library_file(kind), [])
    return data if isinstance(data, list) else []


def save_library(kind, entries):
    _write_json(library_file(kind), entries)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


migrate_legacy_storage()


# ---------- pages / static -----------

@app.route("/")
def index():
    return app.send_static_file("index.html") if False else send_from_directory("templates", "index.html")


@app.route("/data/<kind>/posters/<path:filename>")
def serve_upload(kind, filename):
    return send_from_directory(posters_dir(kind), filename)


# ----------- API -----------

@app.route("/api/entries/<kind>", methods=["GET"])
def list_entries(kind):
    kind = collection_key(kind)
    with _lock:
        entries = load_library(kind)
    return jsonify(entries)


@app.route("/api/entries/<kind>", methods=["POST"])
def create_entry(kind):
    kind = collection_key(kind)
    payload = request.form.to_dict()
    entry = _build_entry(kind, payload, request.files.get("poster"))
    with _lock:
        entries = load_library(kind)
        entries.insert(0, entry)
        save_library(kind, entries)
    return jsonify(entry), 201


@app.route("/api/entries/<kind>/<entry_id>", methods=["PUT"])
def update_entry(kind, entry_id):
    kind = collection_key(kind)
    payload = request.form.to_dict()
    with _lock:
        entries = load_library(kind)
        idx = next((i for i, e in enumerate(entries) if e["id"] == entry_id), None)
        if idx is None:
            abort(404, description="Entry not found")
        existing = entries[idx]
        new_file = request.files.get("poster")
        entry = _build_entry(kind, payload, new_file, existing=existing)
        if (new_file and existing.get("poster")
                and Path(existing["poster"]).name != Path(entry["poster"]).name):
            _delete_poster_file(kind, existing["poster"])
        entries[idx] = entry
        save_library(kind, entries)
    return jsonify(entry)


@app.route("/api/entries/<kind>/reorder-items", methods=["POST"])
def reorder_items(kind):
    kind = collection_key(kind)
    payload = request.get_json(silent=True) or {}
    ordered_ids = payload.get("ids", [])
    if not isinstance(ordered_ids, list):
        abort(400, description="IDs must be a list")
    order_by_id = {str(entry_id): index for index, entry_id in enumerate(ordered_ids)}
    with _lock:
        entries = load_library(kind)
        for entry in entries:
            if entry.get("id") in order_by_id:
                entry["itemOrder"] = order_by_id[entry["id"]]
        save_library(kind, entries)
    return jsonify({"ok": True})


@app.route("/api/entries/<kind>/reorder-groups", methods=["POST"])
def reorder_groups(kind):
    kind = collection_key(kind)
    payload = request.get_json(silent=True) or {}
    ordered_groups = payload.get("groups", [])
    if not isinstance(ordered_groups, list):
        abort(400, description="Groups must be a list")
    order_by_group = {str(group).casefold(): index for index, group in enumerate(ordered_groups)}
    with _lock:
        entries = load_library(kind)
        for entry in entries:
            group = (entry.get("seriesTitle") or entry.get("title") or "").strip().casefold()
            if group in order_by_group:
                entry["sortOrder"] = order_by_group[group]
        save_library(kind, entries)
    return jsonify({"ok": True})


@app.route("/api/entries/<kind>/<entry_id>", methods=["DELETE"])
def delete_entry(kind, entry_id):
    kind = collection_key(kind)
    with _lock:
        entries = load_library(kind)
        idx = next((i for i, e in enumerate(entries) if e["id"] == entry_id), None)
        if idx is None:
            abort(404, description="Entry not found")
        removed = entries.pop(idx)
        save_library(kind, entries)
    if removed.get("poster"):
        _delete_poster_file(kind, removed["poster"])
    return jsonify({"ok": True})


def _delete_poster_file(kind, poster_path):
    try:
        filename = Path(poster_path).name
        target = posters_dir(kind) / filename
        if target.exists():
            target.unlink()
    except Exception:
        pass


def _build_entry(kind, payload, file_storage, existing=None):
    existing = existing or {}
    entry_id = existing.get("id") or uuid.uuid4().hex
    title = (payload.get("title") or existing.get("title") or "").strip()
    if not title:
        abort(400, description="Title is required")
    status = payload.get("status", existing.get("status", "planning"))
    if status not in ("watching", "watched", "planning"):
        status = "planning"
    score_raw = payload.get("score", existing.get("score"))
    score = None
    if score_raw not in (None, "", "null"):
        try:
            score = max(0, min(10, float(score_raw)))
        except (TypeError, ValueError):
            score = None
    poster_path = existing.get("poster", "")
    if file_storage and file_storage.filename:
        if not allowed_file(file_storage.filename):
            abort(400, description="Unsupported image type")
        ext = file_storage.filename.rsplit(".", 1)[1].lower()
        filename = secure_filename(f"{entry_id}.{ext}")
        file_storage.save(posters_dir(kind) / filename)
        poster_path = f"data/{kind}/posters/{filename}"
    elif payload.get("remove_poster") == "1":
        if poster_path:
            _delete_poster_file(kind, poster_path)
        poster_path = ""
    entry = {"id": entry_id, "title": title, "poster": poster_path, "status": status, "score": score}
    release_date = (payload.get("releaseDate", existing.get("releaseDate", "")) or "").strip()
    if len(release_date) >= 4 and release_date[:4].isdigit():
        release_date = release_date[:4]
    else:
        release_date = ""
    if release_date and not 1800 <= int(release_date) <= 3000:
        release_date = ""

    airing_status = payload.get("airingStatus", existing.get("airingStatus", "released"))
    allowed_airing = ("upcoming", "ongoing", "completed", "released")
    if airing_status not in allowed_airing:
        airing_status = "completed" if kind == "anime" else "released"

    genres_raw = payload.get("genres", existing.get("genres", []))
    if isinstance(genres_raw, list):
        genres_raw = ",".join(str(genre) for genre in genres_raw)
    genres, seen_genres = [], set()
    for genre in str(genres_raw or "").split(","):
        genre = genre.strip()
        genre_key = genre.casefold()
        if genre and genre_key not in seen_genres:
            genres.append(genre[:40])
            seen_genres.add(genre_key)

    entry["releaseDate"] = release_date
    entry["airingStatus"] = airing_status
    entry["genres"] = genres
    entry["seriesTitle"] = (payload.get("seriesTitle", existing.get("seriesTitle", "")) or "").strip()[:160]
    entry["author"] = (payload.get("author", existing.get("author", "")) or "").strip()[:120]

    if kind == "anime":
        def _int_or_none(key):
            raw = payload.get(key, existing.get(key))
            if raw in (None, "", "null"):
                return None
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None
        entry["episodesWatched"] = _int_or_none("episodesWatched")
        entry["episodesTotal"] = _int_or_none("episodesTotal")
    return entry


if __name__ == "__main__":
    app.run(debug=True, port=5000)
