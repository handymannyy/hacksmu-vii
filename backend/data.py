import httpx

# Commercial water prices (USD/m³) by US state — sourced from worldpopulationreview.com
WATER_PRICES_USD_PER_M3: dict[str, float] = {
    "AK": 3.20, "AL": 3.50, "AR": 3.10, "AZ": 5.20, "CA": 6.50,
    "CO": 4.50, "CT": 5.10, "DC": 6.20, "DE": 4.30, "FL": 3.90,
    "GA": 4.10, "HI": 7.80, "IA": 3.20, "ID": 3.40, "IL": 4.60,
    "IN": 3.80, "KS": 3.60, "KY": 3.70, "LA": 3.30, "MA": 5.40,
    "MD": 5.00, "ME": 4.20, "MI": 4.10, "MN": 3.90, "MO": 3.70,
    "MS": 3.20, "MT": 3.50, "NC": 3.80, "ND": 3.10, "NE": 3.40,
    "NH": 4.50, "NJ": 5.30, "NM": 5.00, "NV": 5.80, "NY": 5.80,
    "OH": 4.00, "OK": 3.60, "OR": 3.70, "PA": 4.40, "RI": 5.00,
    "SC": 3.60, "SD": 3.20, "TN": 3.50, "TX": 4.20, "UT": 4.80,
    "VA": 4.60, "VT": 3.80, "WA": 4.10, "WI": 3.30, "WV": 6.20,
    "WY": 3.20,
}


def get_water_price(state: str) -> float:
    return WATER_PRICES_USD_PER_M3.get(state.upper(), 4.00)


async def get_annual_rainfall(lat: float, lon: float, year: int = 2023) -> dict:
    """Fetch annual precipitation from Open-Meteo Archive API (free, no key)."""
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": f"{year}-01-01",
        "end_date": f"{year}-12-31",
        "daily": "precipitation_sum",
        "timezone": "auto",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

            daily: list[float] = [
                x if x is not None else 0.0
                for x in data.get("daily", {}).get("precipitation_sum", [])
            ]
            annual_mm = sum(daily)

            # Aggregate into 12 monthly buckets
            month_lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
            monthly_mm, idx = [], 0
            for days in month_lengths:
                monthly_mm.append(round(sum(daily[idx : idx + days]), 1))
                idx += days

            return {
                "lat": lat,
                "lon": lon,
                "annual_mm": round(annual_mm, 1),
                "monthly_mm": monthly_mm,
                "source": "open-meteo",
            }
        except Exception:
            # Austin TX 30-year average fallback
            return {
                "lat": lat,
                "lon": lon,
                "annual_mm": 863.0,
                "monthly_mm": [55, 60, 75, 90, 105, 85, 65, 60, 80, 95, 70, 23],
                "source": "fallback-austin-avg",
            }
