#!/usr/bin/env python3
"""
Sport Review — serveur local.

Sert le site et permet d'importer des activités Garmin (.zip ou .fit)
avec un nom officiel et un temps officiel.

    python3 server.py        puis ouvrir http://localhost:8000

Ce qui est enregistré :
  - data/raw/imports/<id>.zip  -> fichier original (ignoré par Git, jamais publié)
  - data/imports.json          -> résumé chiffré de chaque import (publié avec le site)

Aucune dépendance : uniquement la bibliothèque standard de Python 3.
"""

import io
import json
import os
import re
import struct
import sys
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw", "imports")
IMPORTS_FILE = os.path.join(DATA_DIR, "imports.json")
MAX_UPLOAD = 50 * 1024 * 1024  # 50 Mo

# --------------------------------------------------------------------------
# Lecture des fichiers FIT (format binaire Garmin)
# --------------------------------------------------------------------------

FIT_EPOCH = datetime(1989, 12, 31, tzinfo=timezone.utc)

# type de base FIT -> (taille, format struct, valeur "invalide")
BASE_TYPES = {
    0x00: (1, "B", 0xFF), 0x01: (1, "b", 0x7F), 0x02: (1, "B", 0xFF),
    0x83: (2, "h", 0x7FFF), 0x84: (2, "H", 0xFFFF),
    0x85: (4, "i", 0x7FFFFFFF), 0x86: (4, "I", 0xFFFFFFFF),
    0x88: (4, "f", None), 0x89: (8, "d", None),
    0x0A: (1, "B", 0x00), 0x8B: (2, "H", 0x0000), 0x8C: (4, "I", 0x00000000),
    0x8E: (8, "q", 0x7FFFFFFFFFFFFFFF), 0x8F: (8, "Q", 0xFFFFFFFFFFFFFFFF),
    0x90: (8, "Q", 0x0000000000000000),
}

SPORTS = {
    1: "run", 2: "bike", 5: "swim", 11: "walk", 17: "hike",
    0: "other", 4: "gym", 10: "gym", 13: "other",
}


class FitError(Exception):
    pass


def _read_value(raw, base_type, little):
    info = BASE_TYPES.get(base_type)
    if info is None or info[0] != len(raw):
        return None  # chaîne, tableau ou type inconnu : on ignore
    size, fmt, invalid = info
    value = struct.unpack(("<" if little else ">") + fmt, raw)[0]
    if invalid is not None and value == invalid:
        return None
    return value


def parse_fit(data):
    """Retourne la liste des messages 'session' (n°18) et 'file_id' (n°0)."""
    if len(data) < 12 or data[8:12] != b".FIT":
        raise FitError("Ce n'est pas un fichier .fit valide.")
    header_size = data[0]
    data_size = struct.unpack("<I", data[4:8])[0]
    end = min(header_size + data_size, len(data))
    pos = header_size
    definitions = {}
    sessions, file_ids = [], []

    while pos < end:
        header = data[pos]
        pos += 1
        if header & 0x80:  # en-tête compressé (horodatage) : message de données
            local = (header >> 5) & 0x03
            is_def, has_dev = False, False
        else:
            local = header & 0x0F
            is_def = bool(header & 0x40)
            has_dev = bool(header & 0x20)

        if is_def:
            little = data[pos + 1] == 0
            gnum = struct.unpack(("<" if little else ">") + "H", data[pos + 2:pos + 4])[0]
            nfields = data[pos + 4]
            pos += 5
            fields = []
            for _ in range(nfields):
                fields.append((data[pos], data[pos + 1], data[pos + 2]))
                pos += 3
            dev_size = 0
            if has_dev:
                ndev = data[pos]
                pos += 1
                for _ in range(ndev):
                    dev_size += data[pos + 1]
                    pos += 3
            definitions[local] = (gnum, little, fields, dev_size)
            continue

        if local not in definitions:
            raise FitError("Fichier .fit corrompu (définition manquante).")
        gnum, little, fields, dev_size = definitions[local]
        values = {}
        for num, size, base in fields:
            values[num] = _read_value(data[pos:pos + size], base, little)
            pos += size
        pos += dev_size
        if gnum == 18:
            sessions.append(values)
        elif gnum == 0:
            file_ids.append(values)

    return sessions, file_ids


def summarize_fit(data):
    sessions, _ = parse_fit(data)
    if not sessions:
        raise FitError("Aucune activité trouvée dans ce fichier (pas de session).")
    s = sessions[0]

    def scaled(key, factor):
        v = s.get(key)
        return None if v is None else v / factor

    start = s.get(2)
    distance_m = scaled(9, 100)
    timer_s = scaled(8, 1000)
    avg_speed = scaled(124, 1000) or scaled(14, 1000)
    return {
        "date": (FIT_EPOCH + timedelta(seconds=start)).isoformat() if start else None,
        "sport": SPORTS.get(s.get(5), "other"),
        "distance_km": round(distance_m / 1000, 3) if distance_m else None,
        "duration_s": round(timer_s) if timer_s else None,
        "elapsed_s": round(scaled(7, 1000)) if s.get(7) else None,
        "avg_speed_kmh": round(avg_speed * 3.6, 2) if avg_speed else None,
        "avg_hr": s.get(16),
        "max_hr": s.get(17),
        "elevation_m": s.get(22),
        "calories": s.get(11),
    }


def extract_fit(filename, payload):
    """Accepte un .zip (export Garmin) ou un .fit directement."""
    if payload[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            fits = [n for n in z.namelist() if n.lower().endswith(".fit")]
            if not fits:
                raise FitError("Le .zip ne contient aucun fichier .fit.")
            if len(fits) > 1:
                raise FitError("Le .zip contient plusieurs activités : importe-les une par une.")
            return z.read(fits[0])
    if filename.lower().endswith(".fit") or payload[8:12] == b".FIT":
        return payload
    raise FitError("Format non reconnu : il faut un .zip exporté de Garmin Connect ou un .fit.")


# --------------------------------------------------------------------------
# Stockage
# --------------------------------------------------------------------------

def parse_official_time(text):
    """'1:39:02', '39:02' ou '39\\'02' -> secondes."""
    text = (text or "").strip().replace("h", ":").replace("'", ":").replace('"', "")
    if not re.fullmatch(r"\d{1,2}(:\d{1,2}){1,2}", text):
        raise ValueError("Temps officiel invalide : utilise le format h:mm:ss ou mm:ss.")
    parts = [int(p) for p in text.split(":")]
    if any(p >= 60 for p in parts[1:]):
        raise ValueError("Temps officiel invalide : minutes et secondes doivent être < 60.")
    seconds = 0
    for p in parts:
        seconds = seconds * 60 + p
    return seconds


def load_imports():
    if not os.path.exists(IMPORTS_FILE):
        return []
    with open(IMPORTS_FILE, encoding="utf-8") as f:
        return json.load(f).get("imports", [])


def save_imports(imports):
    os.makedirs(DATA_DIR, exist_ok=True)
    imports.sort(key=lambda i: i.get("activity", {}).get("date") or "", reverse=True)
    tmp = IMPORTS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"updated_at": datetime.now().isoformat(timespec="seconds"), "imports": imports},
                  f, ensure_ascii=False, indent=2)
    os.replace(tmp, IMPORTS_FILE)


# --------------------------------------------------------------------------
# Serveur HTTP
# --------------------------------------------------------------------------

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
        path = urlparse(self.path).path
        if path == "/api/status":
            return self._json(200, {"ok": True})
        if path == "/api/imports":
            return self._json(200, {"imports": load_imports()})
        if path.startswith("/data/raw"):
            return self._json(403, {"error": "Accès refusé."})
        return super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/api/imports":
            return self._json(404, {"error": "Introuvable."})
        query = parse_qs(url.query)
        name = (query.get("name", [""])[0]).strip()
        filename = os.path.basename(query.get("filename", ["activite.zip"])[0])
        length = int(self.headers.get("Content-Length") or 0)
        try:
            if not name:
                raise ValueError("Le nom officiel est obligatoire.")
            official_s = parse_official_time(query.get("time", [""])[0])
            if length <= 0:
                raise ValueError("Aucun fichier reçu.")
            if length > MAX_UPLOAD:
                raise ValueError("Fichier trop gros (50 Mo maximum).")
            payload = self.rfile.read(length)
            activity = summarize_fit(extract_fit(filename, payload))
        except (ValueError, FitError, zipfile.BadZipFile) as err:
            return self._json(400, {"error": str(err)})
        except Exception as err:  # fichier inattendu
            return self._json(400, {"error": "Impossible de lire ce fichier (%s)." % err})

        import_id = datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
        ext = ".zip" if payload[:4] == b"PK\x03\x04" else ".fit"
        os.makedirs(RAW_DIR, exist_ok=True)
        with open(os.path.join(RAW_DIR, import_id + ext), "wb") as f:
            f.write(payload)

        entry = {
            "id": import_id,
            "official_name": name,
            "official_time_s": official_s,
            "source_file": filename,
            "imported_at": datetime.now().isoformat(timespec="seconds"),
            "activity": activity,
        }
        imports = load_imports()
        imports.append(entry)
        save_imports(imports)
        return self._json(201, {"import": entry})

    def do_DELETE(self):
        path = urlparse(self.path).path
        m = re.fullmatch(r"/api/imports/([\w-]+)", path)
        if not m:
            return self._json(404, {"error": "Introuvable."})
        import_id = unquote(m.group(1))
        imports = load_imports()
        remaining = [i for i in imports if i["id"] != import_id]
        if len(remaining) == len(imports):
            return self._json(404, {"error": "Import introuvable."})
        save_imports(remaining)
        for ext in (".zip", ".fit"):
            p = os.path.join(RAW_DIR, import_id + ext)
            if os.path.exists(p):
                os.remove(p)
        return self._json(200, {"deleted": import_id})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("  %s\n" % (fmt % args))


def main():
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8000))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Sport Review tourne sur http://localhost:%d  (Ctrl+C pour arrêter)" % port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur.")


if __name__ == "__main__":
    main()
