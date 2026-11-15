#!/usr/bin/env python3
"""
Sport Review — local server.

Serves the website and saves race settings (race name and official time)
to data/courses.json. At startup, refreshes the GPS tracks (see tracks.py).

    python3 server.py        then open http://localhost:8000

No dependencies: Python 3 standard library only.
"""

import json
import os
import re
import sys
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

import tracks

ROOT = os.path.dirname(os.path.abspath(__file__))
COURSES_FILE = os.path.join(ROOT, "data", "courses.json")
TEXT_FIELDS = ("official_name", "official_time", "category")
NUMBER_FIELDS = ("official_distance_km", "official_elevation_m")  # bike rides


CATEGORIES = ("HC", "1", "2", "3", "4")


def parse_cols(text):
    """One climb per line: "category | name | length km | gradient %".
    e.g. "HC | Mont Ventoux | 15,7 km | 8,8 %" (length and gradient are optional)."""
    cols = []
    for line in str(text).splitlines():
        parts = [p.strip() for p in line.split("|")]
        if not any(parts):
            continue
        first = parts[0].upper().replace("CAT", "").strip()
        if first in CATEGORIES or (first == "" and len(parts) > 1):
            cat, name, rest = first, parts[1] if len(parts) > 1 else "", parts[2:]
        else:  # no category given: "name | km | %"
            cat, name, rest = "", parts[0], parts[1:]
        if not name:
            continue
        rest = " ".join(rest).replace(",", ".")
        km = re.search(r"(\d+(?:\.\d+)?)\s*km", rest)
        pct = re.search(r"(\d+(?:\.\d+)?)\s*%", rest)
        cols.append({
            "cat": cat,
            "name": name[:120],
            "length_km": float(km.group(1)) if km else None,
            "gradient_pct": float(pct.group(1)) if pct else None,
        })
    return cols


def load_courses():
    if not os.path.exists(COURSES_FILE):
        return {"courses": []}
    with open(COURSES_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_courses(data):
    data["updated_at"] = datetime.now().isoformat(timespec="seconds")
    tmp = COURSES_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, COURSES_FILE)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path == "/api/status":
            return self._json(200, {"ok": True})
        return super().do_GET()

    def do_PUT(self):
        """PUT /api/courses/<id>  {"official_name": "...", "official_time": "..."}"""
        m = re.fullmatch(r"/api/courses/([\w-]+)", urlparse(self.path).path)
        if not m:
            return self._json(404, {"error": "Not found."})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            changes = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self._json(400, {"error": "Invalid request."})

        data = load_courses()
        course = next((c for c in data["courses"] if c["id"] == unquote(m.group(1))), None)
        if course is None:
            return self._json(404, {"error": "Race not found."})
        for field in TEXT_FIELDS:
            if field in changes:
                course[field] = str(changes[field]).strip()[:200]
        for field in NUMBER_FIELDS:
            if field in changes:
                raw = str(changes[field]).replace(",", ".").replace(" ", "").strip()
                try:
                    course[field] = round(float(raw), 2) if raw else None
                except ValueError:
                    return self._json(400, {"error": "Please enter a number."})
        if "cols" in changes:
            previous = {c.get("name"): c for c in course.get("cols", []) if isinstance(c, dict)}
            cols = parse_cols(changes["cols"])
            for col in cols:  # keep the position of each climb along the GPS track
                for key in ("km_start", "km_end"):
                    if key in previous.get(col["name"], {}):
                        col[key] = previous[col["name"]][key]
            course["cols"] = cols
        save_courses(data)
        return self._json(200, {"course": course})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("  %s\n" % (fmt % args))


def main():
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8000))
    print("Reading Garmin files...")
    try:
        tracks.build()  # picks up new .zip files in data/garmin/ and refreshes the map tracks
    except Exception as err:
        print("  ! could not build tracks: %s" % err)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Sport Review is running at http://localhost:%d  (Ctrl+C to stop)" % port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
