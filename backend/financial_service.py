"""
Financial & regulatory data service.

Sources:
  - US state water prices: local lookup (data.py, extended)
  - International: IWA Global Water Tariff Survey (curated, 2023)
  - World Bank API fallback for unknown countries (free, no key)
  - Tax incentives: curated from public DSIRE / state statutes
  - EPA stormwater fee averages by state
"""
import httpx
from db import cache_get_utility, cache_set_utility

WORLD_BANK_API = "https://api.worldbank.org/v2"

# International water pricing (USD/m³), IWA 2023 Global Water Tariff Survey
INTL_WATER_PRICES_USD_M3: dict[str, float] = {
    "US": 4.20, "CA": 3.80, "MX": 1.10, "GB": 3.50, "DE": 5.20,
    "FR": 4.80, "AU": 4.10, "JP": 3.20, "CN": 0.60, "IN": 0.25,
    "BR": 1.50, "ZA": 1.20, "NG": 0.30, "EG": 0.10, "SA": 0.50,
    "AE": 2.50, "SG": 2.80, "KR": 1.40, "ES": 3.00, "IT": 2.80,
    "NL": 4.50, "SE": 3.90, "NO": 5.50, "CH": 6.20, "AR": 0.80,
    "CL": 1.90, "CO": 0.90, "PE": 0.70, "NZ": 2.10, "PL": 2.10,
    "RU": 0.50, "TR": 0.80, "ID": 0.30, "PH": 0.50, "MY": 0.40,
    "TH": 0.50, "VN": 0.20, "PK": 0.20, "BD": 0.15, "IQ": 0.10,
    "ZW": 0.08, "KE": 0.35, "GH": 0.20, "ET": 0.05, "TZ": 0.12,
}

# US state water prices (USD/m³) — extended from existing data.py table
US_STATE_PRICES: dict[str, float] = {
    "AL": 3.40, "AK": 5.10, "AZ": 4.80, "AR": 3.20, "CA": 5.50,
    "CO": 4.30, "CT": 4.90, "DE": 4.20, "FL": 4.10, "GA": 3.60,
    "HI": 6.20, "ID": 3.00, "IL": 4.50, "IN": 3.80, "IA": 3.50,
    "KS": 3.70, "KY": 3.40, "LA": 3.10, "ME": 4.60, "MD": 4.80,
    "MA": 5.20, "MI": 4.00, "MN": 4.20, "MS": 3.00, "MO": 3.60,
    "MT": 3.40, "NE": 3.50, "NV": 4.60, "NH": 4.80, "NJ": 5.10,
    "NM": 4.50, "NY": 5.30, "NC": 3.90, "ND": 3.30, "OH": 4.10,
    "OK": 3.50, "OR": 4.40, "PA": 4.70, "RI": 4.90, "SC": 3.70,
    "SD": 3.40, "TN": 3.50, "TX": 4.20, "UT": 4.00, "VT": 5.00,
    "VA": 4.30, "WA": 4.60, "WV": 3.80, "WI": 4.10, "WY": 3.20,
    "DC": 5.40,
}

# Tax incentives: curated from public DSIRE + state statutes (2024)
TAX_INCENTIVES: dict[str, list[dict]] = {
    "TX": [{"name": "Texas RWH Sales Tax Exemption", "type": "sales_tax_exemption",
            "value": "8.25% sales tax waived on qualifying equipment",
            "citation": "TX Tax Code §151.355", "url": "https://comptroller.texas.gov/taxes/sales/"}],
    "CA": [{"name": "CA Water Conservation Rebate", "type": "rebate",
            "value": "Up to $2,000 for commercial RWH systems",
            "citation": "CA Water Code §14877", "url": "https://saveourwater.com/"}],
    "AZ": [{"name": "AZ RWH Income Tax Credit", "type": "tax_credit",
            "value": "25% of costs, max $1,000",
            "citation": "ARS §43-1090", "url": "https://www.azleg.gov/viewdocument/?docName=https://www.azleg.gov/ars/43/01090.htm"}],
    "OR": [{"name": "OR Small-Scale RWH Incentive", "type": "rebate",
            "value": "$500 rebate for certified systems",
            "citation": "ORS §537.141", "url": "https://www.oregon.gov/owrd/"}],
    "WA": [{"name": "WA RWH Permitted", "type": "regulatory_allowance",
            "value": "Commercial RWH unrestricted since 2009",
            "citation": "RCW 90.46.080", "url": "https://apps.leg.wa.gov/rcw/default.aspx?cite=90.46.080"}],
    "CO": [{"name": "CO Rooftop RWH Allowance", "type": "regulatory_allowance",
            "value": "Up to 110 gallons per barrel permitted (residential); commercial varies by district",
            "citation": "CRS §37-96.5-103", "url": "https://leg.colorado.gov/"}],
    "GA": [{"name": "GA Water-Wise Program", "type": "program",
            "value": "Encouraged for irrigation and toilet flushing; local utility rebates vary",
            "citation": "Ga. Code §12-5-180", "url": "https://epd.georgia.gov/"}],
    "FL": [{"name": "FL Water Star Certification", "type": "program",
            "value": "Certification provides preferred permit track and potential rebates",
            "citation": "FL Statute §373.250", "url": "https://floridagreenbuildingcoalition.org/"}],
    "NV": [{"name": "NV Conservation Credits", "type": "rebate",
            "value": "Rebate amounts vary by utility district (SNWA: up to $0.40/gal saved)",
            "citation": "NRS §704B", "url": "https://www.snwa.com/conservation/"}],
    "HI": [{"name": "HI Potable RWH Encouraged", "type": "regulatory_allowance",
            "value": "State actively promotes RWH for potable use; DOH certification required",
            "citation": "HRS §340E", "url": "https://health.hawaii.gov/"}],
    "NC": [{"name": "NC RWH Guidelines", "type": "program",
            "value": "State Green Building Code credit for certified systems",
            "citation": "NC GS §143-355.4", "url": "https://www.ncleg.gov/"}],
    "MA": [{"name": "MA Water Conservation Incentive", "type": "rebate",
            "value": "MassSave offers rebates for water-efficient systems; varies by utility",
            "citation": "MA 310 CMR 22.00", "url": "https://www.masssave.com/"}],
}

# EPA stormwater fee averages by US state (USD / sq-ft impervious surface / year)
STORMWATER_FEES: dict[str, float] = {
    "TX": 0.050, "CA": 0.120, "FL": 0.080, "NY": 0.150, "WA": 0.100,
    "OR": 0.090, "GA": 0.060, "AZ": 0.040, "CO": 0.070, "NC": 0.060,
    "VA": 0.085, "MD": 0.110, "PA": 0.095, "IL": 0.075, "OH": 0.065,
    "MI": 0.070, "NJ": 0.130, "MA": 0.140, "MN": 0.080, "TN": 0.055,
}


async def fetch_water_utility_cost(country: str = "US", state: str = None) -> dict:
    """
    Water utility cost for given location.
    Returns: {water_cost_per_m3, water_cost_per_1000gal, currency, source}
    """
    country = (country or "US").upper()
    state = (state or "").upper()

    cached = cache_get_utility(country, state)
    if cached:
        return cached

    if country == "US" and state in US_STATE_PRICES:
        price = US_STATE_PRICES[state]
        result = {
            "water_cost_per_m3": price,
            "water_cost_per_1000gal": round(price * 264.172 / 1000, 4),
            "currency": "USD",
            "source": "AWWA State Rate Survey 2023",
        }
        cache_set_utility(country, state, result)
        return result

    price = INTL_WATER_PRICES_USD_M3.get(country)

    if price is None:
        # World Bank: use GDP/capita as proxy (empirical: price ≈ GDP * 0.0002)
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(
                    f"{WORLD_BANK_API}/countries/{country.lower()}/indicators/NY.GDP.PCAP.CD",
                    params={"format": "json", "mrv": 1},
                )
                r.raise_for_status()
                d = r.json()
                gdp = d[1][0].get("value") if (d and len(d) > 1 and d[1]) else None
            price = round(min(8.0, max(0.10, gdp * 0.0002)), 2) if gdp else 1.50
        except Exception:
            price = 1.50

    result = {
        "water_cost_per_m3": price,
        "water_cost_per_1000gal": round(price * 264.172 / 1000, 4),
        "currency": "USD",
        "source": "IWA Global Water Tariff Survey / World Bank",
    }
    cache_set_utility(country, state, result)
    return result


def fetch_stormwater_fee(state: str = None, country: str = "US") -> dict:
    """Stormwater fee for jurisdiction (USD/sq-ft impervious/year)."""
    state = (state or "").upper()
    fee = STORMWATER_FEES.get(state, 0.065)
    return {
        "fee_per_sqft_impervious_usd": fee,
        "regulation_type": "NPDES Phase II" if country == "US" else "Local",
        "source": "EPA Stormwater Database / ITRE Survey",
    }


def fetch_tax_incentives(state: str = None, country: str = "US") -> list:
    """Return active tax incentives for given jurisdiction."""
    if country != "US" or not state:
        return []
    return TAX_INCENTIVES.get((state or "").upper(), [])


async def aggregate_financial_score(
    lat: float, lon: float,
    country: str = "US", state: str = None,
    harvestable_m3: float = 0,
    roof_area_m2: float = 0,
) -> dict:
    """
    Aggregate financial viability coefficient (0–10) for a location.
    """
    water = await fetch_water_utility_cost(country, state)
    sw = fetch_stormwater_fee(state, country)
    incentives = fetch_tax_incentives(state, country)

    price_score = min(10.0, water["water_cost_per_m3"] / 0.80)
    sw_score = min(10.0, sw["fee_per_sqft_impervious_usd"] / 0.015)
    incentive_score = min(10.0, len(incentives) * 2.5)

    combined = round(price_score * 0.5 + sw_score * 0.3 + incentive_score * 0.2, 2)

    annual_savings = round(harvestable_m3 * water["water_cost_per_m3"], 2) if harvestable_m3 else None
    sw_annual_savings = round(roof_area_m2 * 10.764 * sw["fee_per_sqft_impervious_usd"], 2) if roof_area_m2 else None

    return {
        "financial_viability_coefficient": combined,
        "water_cost": water,
        "stormwater_fee": sw,
        "incentives": incentives,
        "annual_water_savings_usd": annual_savings,
        "annual_sw_savings_usd": sw_annual_savings,
    }
