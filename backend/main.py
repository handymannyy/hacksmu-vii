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
from weather_service import compute_cells_batch, fetch_precipitation_forecast
from financial_service import aggregate_financial_score
from climate_risk_service import calculate_resilience_score


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
# Global Climate Heatmap
# ---------------------------------------------------------------------------

@app.get("/api/global-climate-heatmap")
async def global_climate_heatmap(
    south:      float = Query(-60.0),
    west:       float = Query(-180.0),
    north:      float = Query(75.0),
    east:       float = Query(180.0),
    datasource: str   = Query("precipitation",
                              regex="^(precipitation|drought|water_stress|resilience|combined)$"),
    resolution: float = Query(2.0, ge=0.5, le=10.0),
):
    """
    Global climate heatmap as a GeoJSON FeatureCollection of Point features.
    Each point represents one grid cell; use a Mapbox heatmap layer for rendering.

    datasource values:
      precipitation — annual mm (inverted: low=red, high=blue)
      drought       — drought severity index (high=red)
      water_stress  — Falkenmark water stress (high=red)
      resilience    — harvesting opportunity (high=blue)
      combined      — weighted composite (dry/stressed=red, wet=blue)
    """
    lat_range = north - south
    lon_range = (east - west) if east >= west else (360 + east - west)

    # Auto-cap cells to keep response < ~1 500 features
    max_cells = 1200
    estimated = (lat_range / resolution) * (lon_range / resolution)
    if estimated > max_cells:
        resolution = math.sqrt((lat_range * lon_range) / max_cells)
        resolution = max(0.5, round(resolution * 2) / 2)

    # Build grid coordinates
    coords: list[tuple[float, float]] = []
    lat = south + resolution / 2
    while lat < north:
        lon_val = west + resolution / 2
        while lon_val < east:
            coords.append((round(lat, 4), round(lon_val, 4)))
            lon_val += resolution
        lat += resolution

    cells = await compute_cells_batch(coords, concurrency=20)

    features = []
    for cell in cells:
        if "error" in cell:
            continue

        raw = cell.get("combined_heatmap_value", 0.5)

        if datasource == "precipitation":
            # 0 = very wet (blue), 1 = very dry (red)
            val = max(0.0, min(1.0, 1.0 - cell.get("precipitation_mm", 1000) / 3000))
        elif datasource == "drought":
            val = cell.get("drought_severity", 0) / 100
        elif datasource == "water_stress":
            val = cell.get("water_stress_index", 50) / 100
        elif datasource == "resilience":
            # invert: high resilience = blue (low heatmap value)
            val = 1.0 - max(0.0, min(1.0, cell.get("drought_severity", 50) / 100 * 0.5
                                     + cell.get("water_stress_index", 50) / 100 * 0.5))
        else:
            val = raw

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [cell["lon"], cell["lat"]]},
            "properties": {
                "precipitation_mm":        cell.get("precipitation_mm", 0),
                "precipitation_anomaly_pct": cell.get("precipitation_anomaly_pct", 0),
                "water_stress_index":      cell.get("water_stress_index", 50),
                "drought_severity":        cell.get("drought_severity", 50),
                "flood_risk_pct":          cell.get("flood_risk_pct", 10),
                "temperature_anomaly_c":   cell.get("temperature_anomaly_c", 1.2),
                "combined_heatmap_value":  round(val, 3),
                "data_source":             cell.get("source", "estimate"),
            },
        })

    vals = [f["properties"]["combined_heatmap_value"] for f in features]
    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "datasource": datasource,
            "resolution_deg": resolution,
            "cells": len(features),
            "min_value": round(min(vals), 3) if vals else 0,
            "max_value": round(max(vals), 3) if vals else 1,
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
