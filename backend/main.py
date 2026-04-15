import math
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from models import BuildingsResponse, RainfallResponse
from scoring import score_building
from data import get_annual_rainfall, get_water_price
from cv_buildings import get_buildings_in_bounds
from weather_service import fetch_precipitation_forecast
from financial_service import aggregate_financial_score
from climate_risk_service import calculate_resilience_score


# ---------------------------------------------------------------------------
# Instant global precipitation model (no API calls, runs in < 5 ms)
# Based on Koppen-Geiger climate zones + regional adjustments
# ---------------------------------------------------------------------------

def _instant_precip_mm(lat: float, lon: float) -> float:
    """Return estimated annual precipitation (mm) for any point on Earth."""
    abs_lat = abs(lat)

    # Latitude base
    if abs_lat < 5:    base = 2200.0
    elif abs_lat < 12: base = 1600.0
    elif abs_lat < 18: base = 950.0
    elif abs_lat < 25: base = 480.0   # subtropical dry belt
    elif abs_lat < 32: base = 550.0
    elif abs_lat < 42: base = 700.0
    elif abs_lat < 52: base = 760.0
    elif abs_lat < 62: base = 580.0
    elif abs_lat < 72: base = 340.0
    else:              base = 180.0

    v = base

    # ── WET REGIONS ──────────────────────────────────────────────────────────
    if -15 < lat < 8   and -80 < lon < -45:   v = max(v, 2400.0)  # Amazon
    if  -8 < lat < 8   and  10 < lon < 30:    v = max(v, 1800.0)  # Congo
    if   0 < lat < 10  and -80 < lon < -74:   v = max(v, 3000.0)  # Chocó
    if -10 < lat < 20  and  95 < lon < 155:   v = max(v, 1800.0)  # SE Asia
    if  20 < lat < 28  and  88 < lon < 97:    v = max(v, 2600.0)  # Bangladesh / NE India
    if   5 < lat < 30  and  65 < lon < 100:   v = max(v, 1100.0)  # India monsoon
    if  42 < lat < 52  and -126 < lon < -123: v = max(v, 1400.0)  # PNW coast (Olympic, BC coast)
    if  42 < lat < 52  and -123 < lon < -117: v = max(v, 950.0)   # PNW inland (Seattle, Portland)
    if  55 < lat < 65  and -165 < lon < -145: v = max(v, 1400.0)  # SE Alaska
    if  -5 < lat < 10  and  30 < lon < 50:    v = max(v, 1200.0)  # East Africa lakes
    if -12 < lat < -5  and 142 < lon < 152:   v = max(v, 1800.0)  # N Queensland
    if  15 < lat < 25  and 108 < lon < 122:   v = max(v, 1500.0)  # South China
    if -60 < lat < -40 and -76 < lon < -68:   v = max(v, 2500.0)  # Chilean fjords

    # ── DRY REGIONS ──────────────────────────────────────────────────────────
    if  18 < lat < 32  and   5 < lon < 40:    v = min(v,  80.0)   # Sahara core
    if  12 < lat < 18  and -18 < lon < 15:    v = min(v, 350.0)   # Sahel
    if  15 < lat < 32  and  36 < lon < 60:    v = min(v, 110.0)   # Arabia
    if  25 < lat < 50  and  50 < lon < 80:    v = min(v, 280.0)   # Central Asia
    if  28 < lat < 38  and  80 < lon < 100:   v = min(v, 350.0)   # Tibetan plateau rain-shadow
    if -28 < lat < -18 and -72 < lon < -67:   v = min(v,  30.0)   # Atacama
    if -50 < lat < -35 and -70 < lon < -60:   v = min(v, 300.0)   # Patagonian steppe
    if  32 < lat < 42  and -122 < lon < -108: v = min(v, 250.0)   # US Basin & Range / SW desert
    if  34 < lat < 40  and -117 < lon < -113: v = min(v, 150.0)   # Mojave / Nevada desert (drier)
    if  25 < lat < 35  and -104 < lon <  -79: v = max(v, 700.0)   # Gulf Coast / Texas / Louisiana / Florida
    if  24 < lat < 31  and  -88 < lon <  -79: v = max(v, 1400.0)  # Florida subtropical wet
    if  27 < lat < 47  and   -88 < lon < -67: v = max(v, 1000.0)  # US East Coast / Appalachians
    if  24 < lat < 40  and  125 < lon < 148:  v = max(v, 1400.0)  # Japan / Korea maritime
    if  22 < lat < 32  and   30 < lon <  38:  v = min(v,  30.0)   # Egypt / Red Sea coast (hyper-arid)
    if -30 < lat < -18 and  -46 < lon < -38:  v = max(v, 1400.0)  # SE Brazil coast (Rio, Sao Paulo)
    if -32 < lat < -22 and 118 < lon < 142:   v = min(v, 250.0)   # Australian outback
    if -18 < lat < -10 and  20 < lon < 35:    v = min(v, 380.0)   # Kalahari
    if   5 < lat < 15  and  38 < lon < 48:    v = min(v, 320.0)   # Ethiopian highlands rain-shadow
    if  20 < lat < 35  and  75 < lon < 110:   v = min(v, 250.0)   # Pakistani / NW India arid zone
    if  35 < lat < 50  and  90 < lon < 120:   v = min(v, 300.0)   # Mongolian steppe
    if  25 < lat < 35  and 110 < lon < 125:   v = min(v, 350.0)   # South China interior

    # ── MEDITERRANEAN (moderate, capped) ─────────────────────────────────────
    if  30 < lat < 44 and  -6 < lon < 22:     v = min(max(v, 380.0), 850.0)  # Med basin
    if  32 < lat < 38 and -125 < lon < -118:  v = min(max(v, 380.0), 700.0)  # California

    return max(50.0, v)


def _value_for_datasource(precip_mm: float, datasource: str, lat: float) -> float:
    """Normalise precipitation to 0 (wet/blue) → 1 (dry/red) for the given layer."""
    if datasource == "precipitation":
        # Log scale so extreme deserts and rainforests are distinguishable
        import math as _m
        return max(0.0, min(1.0, 1.0 - _m.log10(max(50.0, precip_mm)) / _m.log10(4000.0)))
    elif datasource == "drought":
        return max(0.0, min(1.0, (1400.0 - precip_mm) / 1400.0))
    elif datasource == "water_stress":
        abs_lat = abs(lat)
        pet = (1600 if abs_lat < 15 else 1300 if abs_lat < 30
               else 900 if abs_lat < 45 else 650 if abs_lat < 60 else 420)
        return max(0.0, min(1.0, (pet / max(precip_mm, 1.0) - 0.5) / 3.5))
    elif datasource == "resilience":
        # Opportunity peaks ~700–1 200 mm/yr; invert so high opp = blue (low value)
        opp = max(0.0, 1.0 - abs(precip_mm - 900.0) / 1600.0)
        return max(0.0, min(1.0, 1.0 - opp))
    else:  # combined
        d = max(0.0, min(1.0, (1200.0 - precip_mm) / 1200.0))
        p = max(0.0, min(1.0, 1.0 - precip_mm / 3000.0))
        return (d * 0.5 + p * 0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
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
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"status": "ok", "service": "RainUSE Nexus API"}


@app.get("/api/buildings", response_model=BuildingsResponse)
async def get_buildings():
    return BuildingsResponse(buildings=[], total=0)


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
    return {
        "total_buildings": 0,
        "avg_score": 0,
        "max_score": 0,
        "total_annual_value": 0,
        "high_viability_count": 0,
        "medium_viability_count": 0,
        "low_viability_count": 0,
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


# ---------------------------------------------------------------------------
# Global Climate Heatmap  (instant — pure local model, no external API calls)
# ---------------------------------------------------------------------------

@app.get("/api/global-climate-heatmap")
def global_climate_heatmap(
    south:      float = Query(-60.0),
    west:       float = Query(-180.0),
    north:      float = Query(75.0),
    east:       float = Query(180.0),
    datasource: str   = Query("precipitation"),
    resolution: float = Query(3.0, ge=0.5, le=10.0),
):
    """
    Instant global climate overlay as GeoJSON polygon cells.
    Uses a built-in Koppen-Geiger + regional model — no external API calls,
    responds in < 50 ms for any viewport.

    Use as a Mapbox 'fill' layer, not a heatmap layer.
    combined_heatmap_value: 0 = wet/blue, 1 = dry/red.
    """
    lat_range = north - south
    lon_range = east - west if east >= west else 360 + east - west

    # Auto-coarsen resolution to keep cell count ≤ 3 000
    max_cells = 3000
    if lat_range * lon_range / (resolution ** 2) > max_cells:
        resolution = math.sqrt(lat_range * lon_range / max_cells)
        resolution = max(0.5, round(resolution * 4) / 4)  # snap to 0.25° steps

    half = resolution / 2.0
    features = []

    lat = south + half
    while lat <= north + 0.001:
        lon = west + half
        while lon <= east + 0.001:
            precip = _instant_precip_mm(lat, lon)
            val = round(_value_for_datasource(precip, datasource, lat), 3)

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [round(lon - half, 4), round(lat - half, 4)],
                        [round(lon + half, 4), round(lat - half, 4)],
                        [round(lon + half, 4), round(lat + half, 4)],
                        [round(lon - half, 4), round(lat + half, 4)],
                        [round(lon - half, 4), round(lat - half, 4)],
                    ]],
                },
                "properties": {
                    "combined_heatmap_value": val,
                    "precipitation_mm": round(precip, 0),
                    "lat": round(lat, 2),
                    "lon": round(lon, 2),
                },
            })
            lon += resolution
        lat += resolution

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "datasource": datasource,
            "resolution_deg": round(resolution, 2),
            "cells": len(features),
        },
    }


@app.get("/api/climate-detail")
async def climate_detail(
    lat:     float = Query(...),
    lon:     float = Query(...),
    country: str   = Query("US"),
    state:   str   = Query(None),
):
    """
    Full climate + financial detail for a clicked map location.
    Used by the ClimateInfoPanel when a user clicks the heatmap.
    """
    precip_task   = fetch_precipitation_forecast(lat, lon, days=14)
    financial_task = aggregate_financial_score(lat, lon, country, state or "TX")
    resilience_task = calculate_resilience_score(lat, lon)

    from weather_service import fetch_historical_precipitation
    historical_task = fetch_historical_precipitation(lat, lon)

    historical, forecast, financial, resilience = await asyncio.gather(
        historical_task, precip_task, financial_task, resilience_task
    )

    return {
        "lat": lat,
        "lon": lon,
        "precipitation": historical,
        "forecast": forecast,
        "financial": financial,
        "resilience": resilience,
    }
