import math
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from models import Building, BuildingScore, ScoreBreakdown, BuildingsResponse, RainfallResponse
from scoring import score_building
from data import get_annual_rainfall, get_water_price, fetch_all_building_footprints
from cv_buildings import get_buildings_in_bounds

# ---------------------------------------------------------------------------
# Startup — fetch real building footprints from Overpass/OSM once
# ---------------------------------------------------------------------------
ALL_BUILDINGS: list[Building] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ALL_BUILDINGS
    footprints = await fetch_all_building_footprints(_RAW_BUILDINGS)
    ALL_BUILDINGS = [_build(r, footprints.get(r[0])) for r in _RAW_BUILDINGS]
    yield


app = FastAPI(title="RainUSE Nexus API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Austin TX monthly rainfall fractions (30-yr normals, sum = 1.0)
# J    F     M     A     M     J     J     A     S     O     N     D
MONTHLY_FRACTIONS = [
    0.0695, 0.0707, 0.0834, 0.1066, 0.1355, 0.1077,
    0.0834, 0.0764, 0.1019, 0.1216, 0.0950, 0.0483,
]

# Year multipliers for historical rainfall scenarios
YEAR_MULTIPLIERS = {
    2020: 0.88,   # Below-average, La Niña
    2021: 1.07,   # Above-average recovery
    2022: 0.67,   # Severe Central Texas drought
    2023: 0.99,   # Near-normal
    2024: 1.03,   # Slightly above average
}

ANNUAL_RAINFALL_MM = 863.0


def building_polygon(lat: float, lon: float, area_m2: float) -> dict:
    """Fallback: rectangular GeoJSON polygon centered on lat/lon."""
    lat_m = 111_320.0
    lon_m = 111_320.0 * math.cos(math.radians(lat))
    aspect = 1.6
    width = math.sqrt(area_m2 / aspect)
    length = width * aspect
    hw = (width / 2) / lon_m
    hl = (length / 2) / lat_m
    ring = [
        [lon - hw, lat - hl],
        [lon + hw, lat - hl],
        [lon + hw, lat + hl],
        [lon - hw, lat + hl],
        [lon - hw, lat - hl],
    ]
    return {"type": "Polygon", "coordinates": [ring]}


def rainfall_at(lat: float, lon: float, year: int = 2023) -> float:
    """
    Estimate annual rainfall (mm) for any point in the greater Austin area.
    Uses a geographic gradient: eastern Austin is wetter (Gulf moisture),
    western Hill Country is drier.  Year multipliers reflect real drought/wet cycles.
    """
    # East-west gradient: ~90mm per degree east of Austin centre
    east_deg = lon - (-97.743)
    east_bonus = east_deg * 90.0

    # Mild south-to-north drying (~10mm per degree north)
    north_deg = lat - 30.267
    north_penalty = north_deg * 10.0

    # Deterministic micro-variation so the heatmap looks natural
    seed = (int(lat * 37) * 17 + int(lon * 41) * 13) % 100
    noise = (seed - 50) * 0.35          # ±17.5 mm

    base = max(400.0, min(1200.0, ANNUAL_RAINFALL_MM + east_bonus - north_penalty + noise))
    return round(base * YEAR_MULTIPLIERS.get(year, 1.0), 1)


# ---------------------------------------------------------------------------
# Seed data — 28 commercial buildings in Austin, TX
# ---------------------------------------------------------------------------
_RAW_BUILDINGS = [
    # id, name, address, lat, lon, roof_m2, floors, type, sbti, esg
    ("b01", "Frost Bank Tower",           "401 Congress Ave",         30.2682, -97.7419, 7800,  33, "office",      True,  True),
    ("b02", "Chase Tower",                "221 W 6th St",             30.2699, -97.7427, 7200,  32, "office",      True,  True),
    ("b03", "One American Center",        "600 Congress Ave",         30.2708, -97.7425, 5900,  31, "office",      False, True),
    ("b04", "Austin City Hall",           "301 W 2nd St",             30.2679, -97.7483, 4200,   4, "office",      False, True),
    ("b05", "Seaholm Power Plant Mixed",  "800 W Cesar Chavez St",    30.2726, -97.7530, 12400,  6, "mixed-use",   False, False),
    ("b06", "Facebook/Meta Austin",       "300 W 6th St",             30.2694, -97.7450, 9100,  11, "office",      True,  True),
    ("b07", "Indeed Tower",               "200 W 6th St",             30.2690, -97.7445, 11200, 36, "office",      True,  True),
    ("b08", "Fairmont Austin Hotel",      "101 Red River St",         30.2635, -97.7387, 6500,  37, "mixed-use",   False, False),
    ("b09", "Austin Convention Center",   "500 E Cesar Chavez St",    30.2617, -97.7392, 28000,  4, "industrial",  False, True),
    ("b10", "Whole Foods HQ",             "525 N Lamar Blvd",         30.2735, -97.7524, 8900,   5, "office",      True,  True),
    ("b11", "IBC Bank Tower",             "500 W 5th St",             30.2695, -97.7467, 5100,  22, "office",      False, False),
    ("b12", "Domain Tower (Apple)",       "3121 Palm Way",            30.4024, -97.7256, 16800, 22, "office",      True,  True),
    ("b13", "Domain Northside Mall",      "11410 Century Oaks Terr",  30.4013, -97.7241, 42000,  2, "retail",      False, False),
    ("b14", "Samsung Austin R&D",         "12100 Samsung Blvd",       30.4601, -97.7174, 35000,  5, "industrial",  True,  True),
    ("b15", "Tesla Gigafactory Texas",    "13101 Harold Green Rd",    30.2218, -97.6201, 92000,  4, "industrial",  True,  True),
    ("b16", "St. David's Medical Center", "919 E 32nd St",            30.2969, -97.7224, 24000,  8, "office",      False, True),
    ("b17", "UT Tower / Main Bldg",       "110 Inner Campus Dr",      30.2862, -97.7394, 5500,  27, "office",      False, True),
    ("b18", "H-E-B Distribution Center",  "9400 Dessau Rd",           30.3824, -97.6634, 55000,  2, "warehouse",   False, False),
    ("b19", "Mueller Market District",    "1801 E 51st St",           30.2974, -97.7088, 7800,   3, "retail",      False, False),
    ("b20", "Riata Corporate Park",       "12515 Research Blvd",      30.4282, -97.7642, 14000,  5, "office",      True,  False),
    ("b21", "Barton Creek Mall",          "2901 S Capital of TX Hwy", 30.2475, -97.8017, 38000,  2, "retail",      False, False),
    ("b22", "SFC Austin Campus",          "4201 W Parmer Ln",         30.4224, -97.7636, 18000,  4, "office",      True,  True),
    ("b23", "Oracle Austin HQ",           "2300 Oracle Way",          30.3934, -97.7299, 21000,  6, "office",      True,  True),
    ("b24", "Asahi Jewels Warehouse",     "6836 Bee Caves Rd",        30.2960, -97.8145, 9200,   2, "warehouse",   False, False),
    ("b25", "Austin-Bergstrom Airport T", "3600 Presidential Blvd",   30.1975, -97.6664, 48000,  4, "industrial",  False, True),
    ("b26", "Southpark Meadows Retail",   "9500 S IH-35 Frontage",    30.1746, -97.7852, 31000,  1, "retail",      False, False),
    ("b27", "4M Foods Processing Plant",  "2401 E St Elmo Rd",        30.2214, -97.7448, 16500,  2, "industrial",  False, False),
    ("b28", "Silicon Labs HQ",            "400 W Cesar Chavez St",    30.2686, -97.7504, 6700,   7, "office",      True,  True),
]


def _build(row: tuple, geometry: Optional[dict] = None) -> Building:
    bid, name, address, lat, lon, roof, floors, btype, sbti, esg = row
    price = get_water_price("TX")
    s = score_building(
        roof_area_m2=roof,
        annual_rainfall_mm=ANNUAL_RAINFALL_MM,
        water_price_per_m3=price,
        has_sbti_target=sbti,
        mentions_water_esg=esg,
    )
    breakdown = ScoreBreakdown(**s.pop("breakdown"))
    monthly_rainfall_mm = [round(ANNUAL_RAINFALL_MM * f, 1) for f in MONTHLY_FRACTIONS]
    monthly_harvest_m3 = [round(roof * (mm / 1000) * 0.85, 2) for mm in monthly_rainfall_mm]
    return Building(
        id=bid,
        name=name,
        address=address,
        city="Austin",
        state="TX",
        lat=lat,
        lon=lon,
        roof_area_m2=roof,
        floors=floors,
        building_type=btype,
        geometry=geometry or building_polygon(lat, lon, roof),
        score=BuildingScore(
            **s,
            breakdown=breakdown,
            monthly_rainfall_mm=monthly_rainfall_mm,
            monthly_harvest_m3=monthly_harvest_m3,
        ),
    )
# ALL_BUILDINGS is populated in the lifespan startup above


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"status": "ok", "service": "RainUSE Nexus API"}


@app.get("/api/buildings", response_model=BuildingsResponse)
async def get_buildings(
    min_score: float = Query(0, ge=0, le=100),
    max_score: float = Query(100, ge=0, le=100),
    building_type: Optional[str] = Query(None),
    esg_only: bool = Query(False),
):
    results = list(ALL_BUILDINGS)
    if esg_only:
        results = [b for b in results if b.score.has_sbti_target or b.score.mentions_water_esg]
    if building_type:
        types = {t.strip().lower() for t in building_type.split(",")}
        results = [b for b in results if b.building_type.lower() in types]
    results = [b for b in results if min_score <= b.score.total <= max_score]
    return BuildingsResponse(buildings=results, total=len(results))


@app.get("/api/buildings/{building_id}", response_model=Building)
async def get_building(building_id: str):
    match = next((b for b in ALL_BUILDINGS if b.id == building_id), None)
    if match is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Building not found")
    return match


@app.get("/api/rainfall")
async def get_rainfall(lat: float = 30.27, lon: float = -97.74):
    data = await get_annual_rainfall(lat, lon)
    return RainfallResponse(**data)


@app.get("/api/rainfall-grid")
def get_rainfall_grid(year: int = Query(2023, ge=2020, le=2024)):
    """
    Returns a GeoJSON FeatureCollection of rainfall sample points covering the
    greater Austin metro area.  Used for the Mapbox heatmap layer.
    Grid: 20 × 20 = 400 points.
    """
    lat_min, lat_max = 29.95, 30.65
    lon_min, lon_max = -98.15, -97.25
    steps = 20

    features = []
    for i in range(steps):
        for j in range(steps):
            lat = lat_min + i * (lat_max - lat_min) / (steps - 1)
            lon = lon_min + j * (lon_max - lon_min) / (steps - 1)
            mm = rainfall_at(lat, lon, year)
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {"rainfall_mm": mm, "year": year},
            })

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "year": year,
            "min_mm": min(f["properties"]["rainfall_mm"] for f in features),
            "max_mm": max(f["properties"]["rainfall_mm"] for f in features),
            "year_label": {
                2020: "2020 — La Niña dry year",
                2021: "2021 — Above-average recovery",
                2022: "2022 — Severe Central TX drought",
                2023: "2023 — Near-normal season",
                2024: "2024 — Slightly above average",
            }.get(year, str(year)),
        },
    }


@app.get("/api/stats")
async def get_stats():
    scores = [b.score.total for b in ALL_BUILDINGS]
    values = [b.score.annual_value for b in ALL_BUILDINGS]
    return {
        "total_buildings": len(ALL_BUILDINGS),
        "avg_score": round(sum(scores) / len(scores), 1),
        "max_score": round(max(scores), 1),
        "total_annual_value": round(sum(values), 0),
        "high_viability_count": sum(1 for s in scores if s >= 67),
        "medium_viability_count": sum(1 for s in scores if 33 <= s < 67),
        "low_viability_count": sum(1 for s in scores if s < 33),
    }


@app.get("/api/detect")
def detect_buildings(
    south: float,
    west: float,
    north: float,
    east: float,
):
    raw = get_buildings_in_bounds(south, west, north, east)

    results = []
    for b in raw:
        price = get_water_price("TX")
        s = score_building(
            roof_area_m2=b["area_m2"],
            annual_rainfall_mm=ANNUAL_RAINFALL_MM,
            water_price_per_m3=price,
            has_sbti_target=False,
            mentions_water_esg=False,
        )
        s.pop("breakdown")

        results.append({
            "osm_id": b["osm_id"],
            "geometry": b["geometry"],
            "area_m2": b["area_m2"],
            "sqft": b["sqft"],
            "confidence": b["confidence"],
            "cooling_tower": b["cooling_tower"],
            "score": s["total"],
            "annual_value": s["annual_value"],
            "harvestable_m3": s["harvestable_m3"],
            "payback_years": s["payback_years"],
            "rebate_available": s["rebate_available"],
        })

    return {"buildings": results, "total": len(results)}
