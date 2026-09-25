#!/usr/bin/env python3
"""Regenerate the Swiss Ephemeris reference fixtures for the accuracy gate.

Manual tool: it is not part of the build or the test suite, and it prints the
fixture document to stdout. `README.md` holds the full procedure; the short
version, run from `packages/astrology`:

    python3 -m pip install --target /tmp/vera-se-py pyswisseph
    mkdir -p /tmp/vera-se-ephe
    for f in sepl_18.se1 semo_18.se1 seas_18.se1; do
      curl -fsSL -o "/tmp/vera-se-ephe/$f" \\
        "https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/$f"
    done
    PYTHONPATH=/tmp/vera-se-py python3 fixtures/generate_fixtures.py \\
      --ephe-path /tmp/vera-se-ephe --generated-at 2026-09-24 > fixtures/charts.json

Local civil times are resolved with the IANA tz database (`zoneinfo`)
independently of the engine, so the committed `local` block is a second
implementation the engine is checked against.
"""

import argparse
import json
import os
import sys
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

if os.environ.get("CI"):
    sys.exit("generate_fixtures.py is a manual tool and must not run in CI")

UTC = timezone.utc

EPHEMERIS_FILES = ["sepl_18.se1", "semo_18.se1", "seas_18.se1"]

CASES = [
    dict(
        id="ru-dst-1985-summer-moscow",
        description="Moscow summer time 1985 (UTC+4): a DST transition year.",
        y=1985, mo=7, d=1, h=12, mi=0, lat=55.7558, lon=37.6173,
        zone="Europe/Moscow", house_system="placidus",
    ),
    dict(
        id="ru-dst-1991-summer-moscow",
        description="Moscow 1991 (UTC+3): the year Russia abolished DST; the pre/permanent offset.",
        y=1991, mo=6, d=15, h=12, mi=0, lat=55.7558, lon=37.6173,
        zone="Europe/Moscow", house_system="placidus",
    ),
    dict(
        id="ru-dst-2011-nonexistent-moscow",
        description="Moscow 2011 spring-forward gap (02:00 +3 -> +4): 02:30 does not exist; "
        "tzdb convention shifts it forward, i.e. the pre-transition offset instant.",
        y=2011, mo=3, d=27, h=2, mi=30, lat=55.7558, lon=37.6173,
        zone="Europe/Moscow", house_system="placidus",
    ),
    dict(
        id="ru-dst-2011-summer-moscow",
        description="Moscow 2011 permanent summer time (UTC+4).",
        y=2011, mo=7, d=15, h=12, mi=0, lat=55.7558, lon=37.6173,
        zone="Europe/Moscow", house_system="placidus",
    ),
    dict(
        id="ru-dst-2014-ambiguous-moscow",
        description="Moscow 2014 fall-back hour (02:00 +4 -> +3): 01:30 occurs twice; "
        "the earlier instant is chosen.",
        y=2014, mo=10, d=26, h=1, mi=30, lat=55.7558, lon=37.6173,
        zone="Europe/Moscow", house_system="placidus",
    ),
    dict(
        id="ru-dst-2014-winter-moscow",
        description="Moscow 2014 permanent standard time (UTC+3) after the October change.",
        y=2014, mo=12, d=15, h=12, mi=0, lat=55.7558, lon=37.6173,
        zone="Europe/Moscow", house_system="placidus",
    ),
    dict(
        id="polar-tromso",
        description="Polar latitude (69.65 N): Placidus is undefined; the whole-sign fallback is compared.",
        y=1990, mo=6, d=15, h=12, mi=0, lat=69.6492, lon=18.9553,
        zone="Europe/Oslo", house_system="whole_sign",
    ),
    dict(
        id="southern-sydney",
        description="Southern hemisphere (33.87 S), winter date.",
        y=1990, mo=6, d=15, h=12, mi=0, lat=-33.8688, lon=151.2093,
        zone="Australia/Sydney", house_system="placidus",
    ),
    dict(
        id="retrograde-mercury-berlin",
        description="Mercury retrograde (2024-04-01..25 window), modern date.",
        y=2024, mo=4, d=15, h=12, mi=0, lat=52.52, lon=13.405,
        zone="Europe/Berlin", house_system="placidus",
    ),
    dict(
        id="retrograde-mars-berlin",
        description="Mars retrograde (2022-10-30..12-12 window).",
        y=2022, mo=11, d=15, h=12, mi=0, lat=52.52, lon=13.405,
        zone="Europe/Berlin", house_system="placidus",
    ),
    dict(
        id="baseline-new-york-2000",
        description="J2000-adjacent baseline (2000-01-01), northern mid-latitude.",
        y=2000, mo=1, d=1, h=12, mi=0, lat=40.7128, lon=-74.006,
        zone="America/New_York", house_system="placidus",
    ),
]

BODIES = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "mean_node",
    "true_node",
    "chiron",
]

HOUSE_IDS = {"placidus": b"P", "whole_sign": b"W"}


def load_swisseph():
    """Import the manual reference oracle, or explain how to install it."""
    try:
        import swisseph
    except ModuleNotFoundError:
        sys.exit(
            "pyswisseph is not installed. This is a manual tool; install it with:\n"
            "  python3 -m pip install --target /tmp/vera-se-py pyswisseph\n"
            "and run with PYTHONPATH=/tmp/vera-se-py (see the module docstring)."
        )
    return swisseph


def body_ids(swe):
    return {name: getattr(swe, name.upper()) for name in BODIES}


def resolve_local(case):
    """Resolve the local wall time with IANA rules, independently of the engine."""
    tz = ZoneInfo(case["zone"])
    naive = datetime(case["y"], case["mo"], case["d"], case["h"], case["mi"])
    first = naive.replace(tzinfo=tz, fold=0)
    offset_first = first.utcoffset().total_seconds() / 60
    second = naive.replace(tzinfo=tz, fold=1)
    offset_second = second.utcoffset().total_seconds() / 60
    back = first.astimezone(UTC).astimezone(tz).replace(tzinfo=None)
    exists = back == naive
    if offset_first == offset_second:
        status = "ok"
    elif exists:
        status = "ambiguous"
    else:
        status = "nonexistent"
    # ok -> the only instant; ambiguous -> the earlier (fold=0) occurrence;
    # nonexistent -> fold=0, the tzdb shift-forward instant.
    return status, offset_first, first.astimezone(UTC)


def se_facts(swe, jd_ut, lat, lon):
    flags = swe.FLG_SWIEPH | swe.FLG_SPEED
    bodies = {}
    for name, body_id in body_ids(swe).items():
        xx, _ = swe.calc_ut(jd_ut, body_id, flags)
        bodies[name] = {
            "longitude": round(xx[0] % 360, 6),
            "retrograde": bool(xx[3] < 0),
        }
    houses = {}
    for system_id, hsys in HOUSE_IDS.items():
        # Placidus is undefined at polar latitudes in Swiss Ephemeris too; the
        # reference omits a system the oracle itself cannot produce.
        try:
            cusps, ascmc = swe.houses_ex(jd_ut, lat, lon, hsys)
        except Exception:  # noqa: BLE001
            continue
        # pyswisseph returns 12 cusps with index 0 = Ascendant (no dummy slot).
        houses[system_id] = {
            "ascendant": round(ascmc[0] % 360, 6),
            "midheaven": round(ascmc[1] % 360, 6),
            "cusps": [round(c % 360, 6) for c in cusps[0:12]],
        }
    return {"bodies": bodies, "houses": houses}


def library_version(swe):
    try:
        from importlib.metadata import version as package_version

        return package_version("pyswisseph")
    except Exception:  # noqa: BLE001
        return swe.version


def build_document(swe, generated_at):
    fixtures = []
    for case in CASES:
        status, offset_minutes, instant = resolve_local(case)
        decimal_hour = instant.hour + instant.minute / 60 + instant.second / 3600
        jd_ut = swe.julday(instant.year, instant.month, instant.day, decimal_hour)
        facts = se_facts(swe, jd_ut, case["lat"], case["lon"])
        assert case["house_system"] in facts["houses"], case["id"]
        fixtures.append(
            {
                "id": case["id"],
                "description": case["description"],
                "input": {
                    "instantUtc": instant.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "latitude": case["lat"],
                    "longitude": case["lon"],
                    "timeKnown": True,
                },
                "options": {"houseSystem": case["house_system"]},
                "local": {
                    "date": f"{case['y']:04d}-{case['mo']:02d}-{case['d']:02d}",
                    "time": f"{case['h']:02d}:{case['mi']:02d}",
                    "zone": case["zone"],
                    # For a nonexistent local time the reported offset is
                    # library-specific (pre- or post-transition); the gate
                    # asserts the instant instead.
                    "expectedOffsetMinutes": None if status == "nonexistent" else offset_minutes,
                    "expectedStatus": status,
                },
                "expected": facts,
            }
        )
        print(
            f"{case['id']}: status={status} offset={offset_minutes} jd={jd_ut}",
            file=sys.stderr,
        )
    return {
        "provenance": {
            "reference": f"Swiss Ephemeris {swe.version}",
            "library": f"pyswisseph {library_version(swe)}",
            "ephemerisFiles": EPHEMERIS_FILES,
            "generatedAt": generated_at,
            "procedure": "fixtures/generate_fixtures.py",
        },
        "tolerances": {
            "bodyLongitudeArcsec": 5,
            "moonLongitudeArcsec": 10,
            "cuspArcsec": 10,
            "retrograde": "exact",
        },
        "fixtures": fixtures,
    }


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--ephe-path",
        default=os.environ.get("SE_EPHE_PATH", "/tmp/vera-se-ephe"),
        help="directory holding the Swiss Ephemeris .se1 files",
    )
    parser.add_argument(
        "--generated-at",
        default=date.today().isoformat(),
        help="provenance date (YYYY-MM-DD); pass the committed date for a byte-exact regeneration",
    )
    args = parser.parse_args()

    missing = [
        name
        for name in EPHEMERIS_FILES
        if not os.path.exists(os.path.join(args.ephe_path, name))
    ]
    if missing:
        sys.exit(
            f"missing ephemeris files in {args.ephe_path}: {', '.join(missing)}; "
            "see the module docstring for the download commands"
        )

    swe = load_swisseph()
    swe.set_ephe_path(args.ephe_path)
    print(json.dumps(build_document(swe, args.generated_at), indent=2))


if __name__ == "__main__":
    main()
