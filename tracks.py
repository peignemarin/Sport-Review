#!/usr/bin/env python3
"""
Sport Review — GPS tracks.

Reads every Garmin file listed in data/courses.json (a .zip containing a .fit),
extracts the GPS track, simplifies it and writes data/tracks.json for the
Track Record map. New .zip files dropped in data/garmin/ are added to
data/courses.json automatically.

    python3 tracks.py         (also run automatically by server.py at startup)

No dependencies: Python 3 standard library only.
"""

import io
import json
import math
import os
import struct
import zipfile
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
GARMIN_DIR = os.path.join(ROOT, "data", "garmin")
COURSES_FILE = os.path.join(ROOT, "data", "courses.json")
TRACKS_FILE = os.path.join(ROOT, "data", "tracks.json")

FIT_EPOCH = datetime(1989, 12, 31, tzinfo=timezone.utc)
SEMICIRCLE = 180.0 / 2 ** 31
SPORTS = {1: "run", 2: "bike", 5: "swim", 11: "walk", 17: "hike"}

# FIT base type -> (struct format, invalid value)
BASE_TYPES = {
    0x00: ("B", 0xFF), 0x01: ("b", 0x7F), 0x02: ("B", 0xFF),
    0x83: ("h", 0x7FFF), 0x84: ("H", 0xFFFF), 0x85: ("i", 0x7FFFFFFF),
    0x86: ("I", 0xFFFFFFFF), 0x88: ("f", None), 0x89: ("d", None),
    0x0A: ("B", 0x00), 0x8B: ("H", 0x0000), 0x8C: ("I", 0x00000000),
    0x8E: ("q", 0x7FFFFFFFFFFFFFFF), 0x8F: ("Q", 0xFFFFFFFFFFFFFFFF), 0x90: ("Q", 0),
}


# --------------------------------------------------------------------------
# FIT reader
# --------------------------------------------------------------------------

def read_fit(data, wanted=(18, 20)):
    """Returns {global message number: [ {field number: value} ]} for wanted messages."""
    if len(data) < 12 or data[8:12] != b".FIT":
        raise ValueError("not a .fit file")
    header_size = data[0]
    end = min(header_size + struct.unpack("<I", data[4:8])[0], len(data))
    pos, defs = header_size, {}
    out = {n: [] for n in wanted}
    while pos < end:
        h = data[pos]
        pos += 1
        if h & 0x80:                       # compressed timestamp header
            local, is_def, dev = (h >> 5) & 0x03, False, False
        else:
            local, is_def, dev = h & 0x0F, bool(h & 0x40), bool(h & 0x20)
        if is_def:
            little = data[pos + 1] == 0
            gnum = struct.unpack(("<" if little else ">") + "H", data[pos + 2:pos + 4])[0]
            n = data[pos + 4]
            pos += 5
            fields = [tuple(data[pos + 3 * i:pos + 3 * i + 3]) for i in range(n)]
            pos += 3 * n
            dev_size = 0
            if dev:
                nd = data[pos]
                pos += 1
                dev_size = sum(data[pos + 3 * i + 1] for i in range(nd))
                pos += 3 * nd
            defs[local] = (gnum, little, fields, dev_size)
            continue
        gnum, little, fields, dev_size = defs[local]
        if gnum in out:
            values = {}
            for num, size, base in fields:
                bt = BASE_TYPES.get(base)
                if bt and struct.calcsize(bt[0]) == size:
                    v = struct.unpack(("<" if little else ">") + bt[0], data[pos:pos + size])[0]
                    values[num] = None if v == bt[1] else v
                pos += size
            out[gnum].append(values)
        else:
            pos += sum(f[1] for f in fields)
        pos += dev_size
    return out


def fit_from_zip(path):
    with zipfile.ZipFile(path) as z:
        fits = [n for n in z.namelist() if n.lower().endswith(".fit")]
        if not fits:
            raise ValueError("no .fit in zip")
        return z.read(fits[0])


# --------------------------------------------------------------------------
# Track simplification (Douglas-Peucker)
# --------------------------------------------------------------------------

def simplify(points, tolerance):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, None
        for i in range(a + 1, b):
            x, y = points[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
            if d > best:
                best, idx = d, i
        if idx is not None and best > tolerance:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def simplify_track(pts):
    """~5 m tolerance (in degrees, latitude-corrected)."""
    if not pts:
        return []
    k = math.cos(math.radians(pts[0][1]))
    simple = simplify([(x * k, y) for x, y in pts], 0.000045)
    return [[round(x / k, 6), round(y, 6)] for x, y in simple]


def extract(path, cols=()):
    msgs = read_fit(fit_from_zip(path))
    pts, dist = [], []
    for r in msgs[20]:
        lat, lon = r.get(0), r.get(1)
        if lat is not None and lon is not None:
            pts.append((round(lon * SEMICIRCLE, 6), round(lat * SEMICIRCLE, 6)))
            dist.append(r.get(5) / 100000 if r.get(5) is not None else None)  # km
    track = simplify_track(pts)

    # Climbs (cols / côtes) with a known km range along the activity
    climbs = []
    for col in cols:
        a, b = col.get("km_start"), col.get("km_end")
        if a is None or b is None:
            continue
        seg = [p for p, km in zip(pts, dist) if km is not None and a <= km <= b]
        if len(seg) > 1:
            climbs.append({"name": col.get("name"), "cat": col.get("cat", ""), "points": simplify_track(seg)})

    s = msgs[18][0] if msgs[18] else {}
    start = s.get(2)
    summary = {
        "date": (FIT_EPOCH + timedelta(seconds=start)).isoformat() if start else None,
        "sport": SPORTS.get(s.get(5), "other"),
        "distance_km": round(s[9] / 100000, 3) if s.get(9) else None,
        "duration_s": round(s[8] / 1000) if s.get(8) else None,
        "avg_hr": s.get(16),
        "max_hr": s.get(17),
        "elevation_m": s.get(22),
    }
    return track, summary, climbs


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def load_courses():
    if not os.path.exists(COURSES_FILE):
        return {"courses": []}
    with open(COURSES_FILE, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2 if path == COURSES_FILE else None,
                  separators=None if path == COURSES_FILE else (",", ":"))
        f.write("\n")
    os.replace(tmp, path)


def build():
    data = load_courses()
    courses = data.setdefault("courses", [])
    known = {os.path.basename(c.get("file", "")) for c in courses}
    changed = False

    # New .zip files dropped in data/garmin/
    if os.path.isdir(GARMIN_DIR):
        for name in sorted(os.listdir(GARMIN_DIR)):
            if name.lower().endswith(".zip") and name not in known:
                courses.append({
                    "id": os.path.splitext(name)[0],
                    "file": "data/garmin/" + name,
                    "added_at": date.today().isoformat(),
                    "official_name": "",
                    "official_time": "",
                })
                changed = True
                print("  + new file: " + name)

    tracks = []
    for c in courses:
        path = os.path.join(ROOT, c.get("file", ""))
        if not os.path.exists(path):
            continue
        try:
            track, summary, climbs = extract(path, c.get("cols") or [])
        except Exception as err:  # unreadable file: skip it, keep the others
            print("  ! %s: %s" % (c.get("file"), err))
            continue
        if c.get("activity") != summary:
            c["activity"] = summary
            changed = True
        if track:
            entry = {"id": c["id"], "points": track}
            if climbs:
                entry["climbs"] = climbs
            tracks.append(entry)

    if changed:
        write_json(COURSES_FILE, data)
    write_json(TRACKS_FILE, {"tracks": tracks})
    print("  %d track(s) ready" % len(tracks))
    return len(tracks)


if __name__ == "__main__":
    build()
