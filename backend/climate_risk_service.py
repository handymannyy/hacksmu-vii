"""
Climate risk & resilience data service.

Sources:
  - Open-Meteo Climate Change API — free, no key, CMIP6 EC_Earth3P_HR model
    https://climate-api.open-meteo.com/v1/climate
  - FEMA National Flood Hazard Layer — free, no key (US only)
    https://msc.fema.gov/arcgis/rest/services/FloodZones/
  - World Bank Climate Risk Portal — free, no key
    https://climateknowledgeportal.worldbank.org/api/data/
  - Statistical models from precipitation data (global fallback)
"""
import httpx
from weather_service import fetch_historical_precipitation

OPEN_METEO_CLIMATE = "https://climate-api.open-meteo.com/v1/climate"
FEMA_API = ("https://msc.fema.gov/arcgis/rest/services/FloodZones/"
            "MapServiceExternal/MapServer/0/query")
WB_CLIMATE = "https://climateknowledgeportal.worldbank.org/api/data/get-download-data"


async def fetch_temperature_projection(lat: float, lon: float, horizon: int = 2050) -> dict:
    """
    Temperature projection from Open-Meteo CMIP6 (EC_Earth3P_HR model).
    Falls back to IPCC RCP8.5 estimate.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.get(OPEN_METEO_CLIMATE, params={
                "latitude": lat, "longitude": lon,
                "start_date": f"{horizon}-01-01",
                "end_date": f"{horizon}-12-31",
                "models": "EC_Earth3P_HR",
                "daily": "temperature_2m_max,temperature_2m_min",
            })
            r.raise_for_status()
            d = r.json()

        tmx = [t for t in d["daily"].get("temperature_2m_max_EC_Earth3P_HR", []) if t is not None]
        tmn = [t for t in d["daily"].get("temperature_2m_min_EC_Earth3P_HR", []) if t is not None]

        if tmx:
            avg_max = sum(tmx) / len(tmx)
            avg_min = sum(tmn) / len(tmn) if tmn else avg_max - 10
            proj_temp = round((avg_max + avg_min) / 2, 1)

            # Approximate current baseline from latitude
            baseline = max(-20, 30 - abs(lat) * 0.6)
            increase = round(max(0.0, proj_temp - baseline), 1)

            return {
                "projected_avg_c": proj_temp,
                "temp_increase_c": increase,
                "confidence_range": [max(0.0, increase - 0.5), increase + 0.8],
                "horizon": horizon,
                "model": "EC_Earth3P_HR (CMIP6)",
                "source": "Open-Meteo Climate API",
            }
    except Exception:
        pass

    # IPCC RCP8.5 simplified: polar amplification adds extra warming
    abs_lat = abs(lat)
    increase = round(max(0.8, min(4.5, 1.5 + (abs_lat - 30) * 0.025)), 1)
    return {
        "projected_avg_c": None,
        "temp_increase_c": increase,
        "confidence_range": [round(increase * 0.8, 1), round(increase * 1.4, 1)],
        "horizon": horizon,
        "model": "IPCC RCP8.5 estimate",
        "source": "Statistical estimate",
    }


async def fetch_flood_risk(lat: float, lon: float) -> dict:
    """
    Flood risk from FEMA NFHL (US) or precipitation-based estimate (global).
    """
    # FEMA only covers CONUS + territories
    if -130.0 <= lon <= -60.0 and 24.0 <= lat <= 50.0:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(FEMA_API, params={
                    "geometry": f"{lon},{lat}",
                    "geometryType": "esriGeometryPoint",
                    "inSR": "4326",
                    "spatialRel": "esriSpatialRelIntersects",
                    "outFields": "FLD_ZONE,SFHA_TF",
                    "returnGeometry": "false",
                    "f": "json",
                })
                r.raise_for_status()
                features = r.json().get("features", [])
                if features:
                    attrs = features[0]["attributes"]
                    zone = attrs.get("FLD_ZONE", "X")
                    sfha = attrs.get("SFHA_TF", "F") == "T"
                    risk = {
                        "AE": 80, "A": 75, "AO": 70, "AH": 65,
                        "VE": 90, "V": 85, "X": 5, "D": 15, "B": 10, "C": 5,
                    }.get(zone, 10)
                    return {
                        "flood_probability_pct": risk,
                        "fema_zone": zone,
                        "special_hazard_area": sfha,
                        "return_period_years": 100 if risk > 50 else 500,
                        "source": "FEMA NFHL",
                    }
        except Exception:
            pass

    # Global fallback: precipitation-based proxy
    precip = await fetch_historical_precipitation(lat, lon)
    annual = precip["annual_avg_mm"]
    # High precip regions (> 1500mm) have higher pluvial flood risk
    prob = round(min(55.0, max(2.0, (annual - 500) / 25)), 1)
    return {
        "flood_probability_pct": prob,
        "fema_zone": None,
        "special_hazard_area": False,
        "return_period_years": 100 if prob > 25 else 500,
        "source": "Precipitation-based estimate",
    }


async def fetch_drought_risk(lat: float, lon: float) -> dict:
    """
    Drought risk from precipitation deficit relative to global agricultural threshold.
    """
    precip = await fetch_historical_precipitation(lat, lon)
    annual = precip["annual_avg_mm"]

    threshold = 800  # global rain-fed agriculture minimum (mm)
    deficit_pct = round(max(0.0, (threshold - annual) / threshold * 100), 1)

    if deficit_pct > 60:
        severity, stress = "Extreme", "Very High"
    elif deficit_pct > 40:
        severity, stress = "Severe", "High"
    elif deficit_pct > 20:
        severity, stress = "Moderate", "Moderate"
    elif deficit_pct > 5:
        severity, stress = "Mild", "Low"
    else:
        severity, stress = "None", "Very Low"

    return {
        "drought_severity": severity,
        "deficit_pct": deficit_pct,
        "baseline_water_stress": stress,
        "annual_precip_mm": annual,
        "trend": "Worsening" if annual < 500 else "Stable",
        "source": precip["source"],
    }


async def fetch_climate_exposure(lat: float, lon: float) -> dict:
    """Combined climate exposure score (0–100)."""
    import asyncio
    flood, drought = await asyncio.gather(fetch_flood_risk(lat, lon), fetch_drought_risk(lat, lon))

    flood_score = flood["flood_probability_pct"]
    drought_map = {"Extreme": 90, "Severe": 70, "Moderate": 50, "Mild": 25, "None": 5}
    drought_score = drought_map.get(drought["drought_severity"], 30)

    exposure = round(flood_score * 0.35 + drought_score * 0.65, 1)
    return {
        "climate_exposure_score": exposure,
        "flood_risk": flood,
        "drought_risk": drought,
    }


async def calculate_resilience_score(lat: float, lon: float) -> dict:
    """
    Rainwater harvesting opportunity score (0–100).
    High score = high opportunity: moderate precip + high water stress.
    Too dry (< 200mm) or too wet (> 2500mm) reduces practical value.
    """
    import asyncio
    exposure, precip = await asyncio.gather(
        fetch_climate_exposure(lat, lon),
        fetch_historical_precipitation(lat, lon),
    )

    annual = precip["annual_avg_mm"]

    # Optimal harvesting zone: 300–1400 mm/yr
    precip_opportunity = max(0.0, min(100.0,
        100.0 * (1.0 - abs(annual - 850) / 1500)
    ))
    resilience = round(precip_opportunity * 0.55 + exposure["climate_exposure_score"] * 0.45, 1)

    return {
        "resilience_score": resilience,
        "opportunity_level": "High" if resilience > 66 else "Medium" if resilience > 33 else "Low",
        "annual_precip_mm": annual,
        "climate_exposure": exposure["climate_exposure_score"],
        "precip_opportunity": round(precip_opportunity, 1),
    }
