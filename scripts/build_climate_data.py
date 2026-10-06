"""Build Plantr's bundled climate data from public NOAA and Census datasets.

Outputs (committed to the repo, regenerated rarely):
  src/lib/garden/data/stations.json    NOAA 1991-2020 normals for ~7,000 U.S. weather stations:
                                       median last/first 32°F frost dates and monthly low/high temps.
  src/lib/garden/data/zip-stations.json Each U.S. ZIP code (Census ZCTA) -> nearest station and distance,
                                       as one compact "zip,stationIndex,miles" line per ZIP.

Inputs:
  1. NOAA U.S. Climate Normals 1991-2020, monthly temperature "by variable" archive:
     https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/archive/
       us-climate-normals_1991-2020_v1.0.1_monthly_temperature_by-variable_c20230403.tar.gz
     (extract it; pass the directory containing mly-normal-allall.csv)
  2. Census 2023 ZCTA gazetteer:
     https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip

Usage:
  python3 scripts/build_climate_data.py <noaa_dir> <2023_Gaz_zcta_national.txt> <out_dir>
"""

import csv
import json
import math
import os
import sys
from collections import defaultdict

US_PREFIXES = ("US", "RQ", "VQ", "GQ", "AQ", "CQ")
MAX_MILES = 120
MISSING = -9999.0


def read_inventory(path):
    stations = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            sid = line[0:11].strip()
            if not sid.startswith(US_PREFIXES):
                continue
            try:
                lat = float(line[12:20])
                lon = float(line[21:30])
            except ValueError:
                continue
            state = line[38:40].strip()
            name = line[41:71].strip()
            stations[sid] = {"lat": lat, "lon": lon, "state": state, "name": name}
    return stations


def num(value):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return None if v <= -7777 else v


def read_monthly(path):
    tmin = defaultdict(dict)
    tmax = defaultdict(dict)
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            sid = row["GHCN_ID"].strip()
            month = int(row["month"])
            lo = num(row.get("MLY-TMIN-NORMAL"))
            hi = num(row.get("MLY-TMAX-NORMAL"))
            if lo is not None:
                tmin[sid][month] = lo
            if hi is not None:
                tmax[sid][month] = hi
    return tmin, tmax


def read_frost(path, column):
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            sid = row["GHCN_ID"].strip()
            raw = (row.get(column) or "").strip()
            if "/" in raw:
                mm, dd = raw.split("/")
                out[sid] = f"{int(mm):02d}{int(dd):02d}"
            else:
                out[sid] = None
    return out


def title(name):
    words = []
    for w in name.split():
        if w in ("AP", "AP.", "ARPT"):
            words.append("Airport")
        elif w == "INTL":
            words.append("Intl")
        elif len(w) <= 2 and w.isalpha() and w not in ("OF", "AT", "ON", "IN"):
            words.append(w)
        else:
            words.append(w.capitalize())
    return " ".join(words)


def haversine_mi(lat1, lon1, lat2, lon2):
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def main():
    noaa_dir, gazetteer, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    inventory = read_inventory(os.path.join(noaa_dir, "mly_inventory.txt"))
    tmin, tmax = read_monthly(os.path.join(noaa_dir, "mly-normal-allall.csv"))
    last = read_frost(os.path.join(noaa_dir, "ann-tmin-prblst-t32.csv"), "ANN-TMIN-PRBLST-T32FP50")
    first = read_frost(os.path.join(noaa_dir, "ann-tmin-prbfst-t32.csv"), "ANN-TMIN-PRBFST-T32FP50")

    stations = []
    for sid, meta in inventory.items():
        lows = tmin.get(sid, {})
        highs = tmax.get(sid, {})
        if len(lows) != 12 or len(highs) != 12:
            continue
        lo = [round(lows[m]) for m in range(1, 13)]
        hi = [round(highs[m]) for m in range(1, 13)]
        lf, ff = last.get(sid), first.get(sid)
        if not (lf and ff):
            # No median frost date: keep it only if it's genuinely frost-free (mild coldest month).
            if min(lo) < 40:
                continue
            lf, ff = "", ""
        stations.append(
            [
                f"{title(meta['name'])}, {meta['state']}".strip(", "),
                round(meta["lat"], 3),
                round(meta["lon"], 3),
                lf,
                ff,
                lo,
                hi,
            ]
        )

    # Spatial grid for nearest-station search.
    grid = defaultdict(list)
    for i, s in enumerate(stations):
        grid[(math.floor(s[1]), math.floor(s[2]))].append(i)

    lines = []
    with open(gazetteer, encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        header = [h.strip() for h in next(reader)]
        zi, lai, loi = header.index("GEOID"), header.index("INTPTLAT"), header.index("INTPTLONG")
        for row in reader:
            zipc = row[zi].strip()
            lat, lon = float(row[lai]), float(row[loi])
            best, best_d = None, None
            for radius in (1, 2, 3):
                for dy in range(-radius, radius + 1):
                    for dx in range(-radius, radius + 1):
                        for i in grid.get((math.floor(lat) + dy, math.floor(lon) + dx), []):
                            s = stations[i]
                            d = haversine_mi(lat, lon, s[1], s[2])
                            if best_d is None or d < best_d:
                                best, best_d = i, d
                if best is not None and best_d <= radius * 50:
                    break
            if best is not None and best_d <= MAX_MILES:
                lines.append(f"{zipc},{best},{round(best_d)}")

    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "stations.json"), "w") as f:
        json.dump(
            {
                "source": "NOAA U.S. Climate Normals 1991-2020",
                "fields": ["name", "lat", "lon", "lastFrostMMDD", "firstFrostMMDD", "tminF[12]", "tmaxF[12]"],
                "stations": stations,
            },
            f,
            separators=(",", ":"),
        )
    with open(os.path.join(out_dir, "zip-stations.json"), "w") as f:
        json.dump({"source": "U.S. Census 2023 ZCTA gazetteer", "data": "\n".join(lines)}, f, separators=(",", ":"))
    print(f"{len(stations)} stations, {len(lines)} ZIPs mapped")


if __name__ == "__main__":
    main()
