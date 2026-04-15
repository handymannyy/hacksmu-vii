"""
Global weather & precipitation service.

Priority order:
  1. NASA POWER Climatology API  — free, no key, global 0.5° grid, 1981–present
     https://power.larc.nasa.gov/api/temporal/climatology/point
  2. Open-Meteo ERA5 Archive    — free, no key, global daily since 1940
     https://archive-api.open-meteo.com/v1/archive
  3. Koppen-Geiger statistical estimate (always succeeds)
"""
import asyncio
import math
import httpx
from db import cache_get_cell, cache_set_cell

NASA_CLIMATOLOGY = "https://power.larc.nasa.gov/api/temporal/climatology/point"
OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"

_MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
_DAYS_PER = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


async def fetch_historical_precipitation(lat: float, lon: float) -> dict:
    """
    Annual + monthly precipitation from NASA POWER MERRA-2 climatology.
    Returns: {annual_avg_mm, monthly_avg_mm[12], source}
    """
    lat_r = round(lat * 2) / 2
    lon_r = round(lon * 2) / 2

    # Pull from full cell cache if available
    cached = cache_get_cell(lat_r, lon_r)
    if cached and "annual_avg_mm" in cached:
        return {k: cached[k] for k in ("annual_avg_mm", "monthly_avg_mm", "source")}

    # Try NASA POWER climatology (30-yr averages, no API key)
    try:
        async with httpx.AsyncClient(timeout=25.0) as c:
            r = await c.get(NASA_CLIMATOLOGY, params={
                "parameters": "PRECTOTCORR",
                "community": "RE",
                "longitude": lon_r,
                "latitude": lat_r,
                "format": "JSON",
            })
            r.raise_for_status()
            d = r.json()

        param = d["properties"]["parameter"]["PRECTOTCORR"]
        # NASA returns mm/day averages for each month + "ANN"
        monthly_mm = [round(param.get(k, 0) * dp, 1) for k, dp in zip(_MONTH_KEYS, _DAYS_PER)]
        annual = round(param.get("ANN", 0) * 365, 1)
        if annual == 0:
            annual = round(sum(monthly_mm), 1)

        return {"annual_avg_mm": annual, "monthly_avg_mm": monthly_mm, "source": "NASA POWER MERRA-2"}

    except Exception:
        pass

    # Fallback: Open-Meteo ERA5 (5-year average)
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.get(OPEN_METEO_ARCHIVE, params={
                "latitude": lat_r, "longitude": lon_r,
                "start_date": "2019-01-01", "end_date": "2023-12-31",
                "daily": "precipitation_sum", "timezone": "UTC",
            })
            r.raise_for_status()
            d = r.json()

        monthly_buckets: dict[int, list] = {m: [] for m in range(1, 13)}
        for dt, mm in zip(d["daily"]["time"], d["daily"]["precipitation_sum"]):
            if mm is not None:
                monthly_buckets[int(dt[5:7])].append(mm)

        # Sum each month across years, divide by number of years
        monthly_mm = []
        for m, dp in zip(range(1, 13), _DAYS_PER):
            vals = monthly_buckets[m]
            # vals contains daily mm; sum/days_per_year gives monthly total per year
            n_years = max(1, len(vals) // dp)
            monthly_mm.append(round(sum(vals) / n_years, 1))
        annual = round(sum(monthly_mm), 1)
        return {"annual_avg_mm": annual, "monthly_avg_mm": monthly_mm, "source": "Open-Meteo ERA5"}

    except Exception:
        pass

    return _koppen_estimate(lat, lon)


def _koppen_estimate(lat: float, lon: float) -> dict:
    """Koppen-Geiger based statistical fallback."""
    abs_lat = abs(lat)
    if abs_lat < 10:
        annual = 2100
    elif abs_lat < 15:
        annual = 1500
    elif abs_lat < 25:
        annual = 550   # subtropical dry belt
    elif abs_lat < 40:
        annual = 750
    elif abs_lat < 55:
        annual = 650
    elif abs_lat < 70:
        annual = 380
    else:
        annual = 200

    fracs = [0.085, 0.075, 0.082, 0.088, 0.092, 0.085,
             0.082, 0.085, 0.090, 0.088, 0.082, 0.066]
    if lat < 0:  # southern hemisphere: invert seasonal pattern
        fracs = fracs[6:] + fracs[:6]

    return {
        "annual_avg_mm": annual,
        "monthly_avg_mm": [round(annual * f, 1) for f in fracs],
        "source": "Climate zone estimate",
    }


async def fetch_precipitation_forecast(lat: float, lon: float, days: int = 14) -> dict:
    """Short-range precipitation forecast from Open-Meteo GFS (free, no key)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(OPEN_METEO_FORECAST, params={
                "latitude": lat, "longitude": lon,
                "daily": "precipitation_sum,precipitation_probability_max",
                "timezone": "UTC",
                "forecast_days": min(days, 16),
            })
            r.raise_for_status()
            d = r.json()
        return {
            "dates": d["daily"]["time"],
            "precipitation_mm": d["daily"]["precipitation_sum"],
            "precipitation_probability": d["daily"]["precipitation_probability_max"],
            "source": "Open-Meteo GFS",
        }
    except Exception:
        return {"dates": [], "precipitation_mm": [], "precipitation_probability": [], "source": "unavailable"}


async def compute_cell(lat: float, lon: float) -> dict:
    """
    Compute all climate heatmap metrics for a 0.5° grid cell.
    Cached 24 h in SQLite. Returns normalized values ready for Mapbox heatmap.
    """
    lat_r = round(lat * 2) / 2
    lon_r = round(lon * 2) / 2

    cached = cache_get_cell(lat_r, lon_r)
    if cached:
        return cached

    precip = await fetch_historical_precipitation(lat_r, lon_r)
    annual_mm = precip["annual_avg_mm"]

    # ── Drought severity (0 = no drought, 100 = extreme)
    drought = max(0.0, min(100.0, (1400 - annual_mm) / 14))

    # ── Water stress: simplified Falkenmark PET/P ratio
    abs_lat = abs(lat_r)
    pet = (1600 if abs_lat < 15 else 1300 if abs_lat < 30
           else 900 if abs_lat < 45 else 650 if abs_lat < 60 else 420)
    stress_raw = (pet / max(annual_mm, 1) - 0.5) / 3.5
    stress = max(0.0, min(100.0, stress_raw * 100))

    # ── Precipitation anomaly vs global land mean (~1000 mm)
    precip_anomaly_pct = round((annual_mm - 1000) / 1000 * 100, 1)

    # ── Flood risk proxy: high annual precip → higher flood tendency
    flood_risk = max(0.0, min(60.0, (annual_mm - 600) / 30))

    # ── Combined heatmap value: 0.0 = wet/abundant (blue), 1.0 = dry/stressed (red)
    deficit_norm = max(0.0, min(1.0, (1000 - annual_mm) / 1000))
    combined = (
        drought / 100 * 0.50
        + stress / 100 * 0.30
        + deficit_norm * 0.20
    )
    combined = round(max(0.0, min(1.0, combined)), 3)

    result = {
        "lat": lat_r,
        "lon": lon_r,
        "precipitation_mm": annual_mm,
        "monthly_avg_mm": precip["monthly_avg_mm"],
        "precipitation_anomaly_pct": precip_anomaly_pct,
        "water_stress_index": round(stress, 1),
        "drought_severity": round(drought, 1),
        "flood_risk_pct": round(flood_risk, 1),
        "temperature_anomaly_c": 1.2,   # IPCC 2024 global mean; refined by climate_risk_service
        "combined_heatmap_value": combined,
        "annual_avg_mm": annual_mm,
        "monthly_avg_mm": precip["monthly_avg_mm"],
        "source": precip["source"],
        "data_sources": [precip["source"]],
    }

    cache_set_cell(lat_r, lon_r, result)
    return result


async def compute_cells_batch(coords: list[tuple[float, float]], concurrency: int = 15) -> list[dict]:
    """Compute multiple cells with bounded concurrency."""
    sem = asyncio.Semaphore(concurrency)

    async def _bounded(lat, lon):
        async with sem:
            try:
                return await compute_cell(lat, lon)
            except Exception as e:
                return {"lat": lat, "lon": lon, "error": str(e), "combined_heatmap_value": 0.5}

    return await asyncio.gather(*[_bounded(lat, lon) for lat, lon in coords])
