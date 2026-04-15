"""
SQLite cache for climate data — 24-hour TTL per cell.
No external dependencies beyond stdlib.
"""
import sqlite3
import json
import os
from datetime import datetime

CACHE_DB = os.path.join(os.path.dirname(__file__), "cache", "climate.db")


def init_db():
    os.makedirs(os.path.dirname(CACHE_DB), exist_ok=True)
    with sqlite3.connect(CACHE_DB) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS climate_cells (
                lat   REAL NOT NULL,
                lon   REAL NOT NULL,
                data  TEXT NOT NULL,
                ts    TEXT NOT NULL,
                PRIMARY KEY (lat, lon)
            );
            CREATE TABLE IF NOT EXISTS utility_costs (
                country TEXT NOT NULL,
                state   TEXT NOT NULL DEFAULT '',
                data    TEXT NOT NULL,
                ts      TEXT NOT NULL,
                PRIMARY KEY (country, state)
            );
            CREATE TABLE IF NOT EXISTS esg_data (
                company TEXT NOT NULL PRIMARY KEY,
                data    TEXT NOT NULL,
                ts      TEXT NOT NULL
            );
        """)


def _age_hours(ts: str) -> float:
    return (datetime.utcnow() - datetime.fromisoformat(ts)).total_seconds() / 3600


def cache_get_cell(lat: float, lon: float, ttl_hours: float = 24.0) -> dict | None:
    with sqlite3.connect(CACHE_DB) as conn:
        row = conn.execute(
            "SELECT data, ts FROM climate_cells WHERE lat=? AND lon=?", (lat, lon)
        ).fetchone()
    if row and _age_hours(row[1]) < ttl_hours:
        return json.loads(row[0])
    return None


def cache_set_cell(lat: float, lon: float, data: dict):
    with sqlite3.connect(CACHE_DB) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO climate_cells VALUES (?,?,?,?)",
            (lat, lon, json.dumps(data), datetime.utcnow().isoformat()),
        )


def cache_get_utility(country: str, state: str = "", ttl_hours: float = 168.0) -> dict | None:
    with sqlite3.connect(CACHE_DB) as conn:
        row = conn.execute(
            "SELECT data, ts FROM utility_costs WHERE country=? AND state=?", (country, state)
        ).fetchone()
    if row and _age_hours(row[1]) < ttl_hours:
        return json.loads(row[0])
    return None


def cache_set_utility(country: str, state: str, data: dict):
    with sqlite3.connect(CACHE_DB) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO utility_costs VALUES (?,?,?,?)",
            (country, state, json.dumps(data), datetime.utcnow().isoformat()),
        )


def cache_get_esg(company: str, ttl_hours: float = 72.0) -> dict | None:
    with sqlite3.connect(CACHE_DB) as conn:
        row = conn.execute(
            "SELECT data, ts FROM esg_data WHERE company=?", (company,)
        ).fetchone()
    if row and _age_hours(row[1]) < ttl_hours:
        return json.loads(row[0])
    return None


def cache_set_esg(company: str, data: dict):
    with sqlite3.connect(CACHE_DB) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO esg_data VALUES (?,?,?)",
            (company, json.dumps(data), datetime.utcnow().isoformat()),
        )


# Initialize on import
init_db()
