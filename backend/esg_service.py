"""
Corporate ESG & water commitment data service.

Sources:
  - SEC EDGAR Full-Text Search  — free, no key, public access
    https://efts.sec.gov/LATEST/search-index
  - SBTi Public API             — free registry endpoint (no auth required for GET)
    https://api.sciencebasedtargets.org/v2/companies
  - OpenCorporates search       — free tier, no key needed for basic name search
    https://api.opencorporates.com/v0.4/companies/search
"""
import httpx
from db import cache_get_esg, cache_set_esg

EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index"
SBTI_API = "https://api.sciencebasedtargets.org/v2/companies"
OPENCORP_API = "https://api.opencorporates.com/v0.4/companies/search"

# Water-related keywords to search in 10-K filings
WATER_KEYWORDS = ['"water scarcity"', '"water risk"', '"rainwater harvesting"',
                  '"water efficiency"', '"water conservation"', '"water stress"']


async def fetch_sec_risk_disclosure(company_name: str) -> dict:
    """
    Search SEC EDGAR 10-K filings for water-related risk disclosures.
    Returns mention counts, which signal corporate water risk awareness.
    """
    cached = cache_get_esg(f"sec:{company_name}")
    if cached:
        return cached

    results: dict[str, int] = {}
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            # Search company name + top 2 water keywords (rate-limit friendly)
            for kw in WATER_KEYWORDS[:2]:
                r = await c.get(EDGAR_SEARCH, params={
                    "q": f'"{company_name}" {kw}',
                    "dateRange": "custom",
                    "startdt": "2022-01-01",
                    "enddt": "2024-12-31",
                    "forms": "10-K",
                })
                if r.status_code == 200:
                    d = r.json()
                    results[kw.strip('"')] = d.get("hits", {}).get("total", {}).get("value", 0)

        total = sum(results.values())
        result = {
            "company": company_name,
            "water_mentions": total,
            "has_water_esg": total > 0,
            "keyword_breakdown": results,
            "source": "SEC EDGAR 10-K (2022–2024)",
        }
        cache_set_esg(f"sec:{company_name}", result)
        return result

    except Exception as e:
        return {
            "company": company_name,
            "water_mentions": 0,
            "has_water_esg": False,
            "keyword_breakdown": {},
            "source": "SEC EDGAR (unavailable)",
            "error": str(e),
        }


async def fetch_sbti_status(company_name: str) -> dict:
    """
    Check company's Science Based Targets initiative status.
    Uses the public SBTi API (GET endpoint, no auth required).
    """
    cached = cache_get_esg(f"sbti:{company_name}")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(SBTI_API, params={"name": company_name, "pageSize": 5},
                            headers={"Accept": "application/json"})
            if r.status_code == 200:
                d = r.json()
                companies = d.get("data", d.get("companies", []))
                if companies:
                    co = companies[0]
                    result = {
                        "has_sbti_target": (
                            co.get("hasNearTermTarget", False)
                            or co.get("status", "") in ("Committed", "Targets Set")
                        ),
                        "sbti_status": co.get("status", "Unknown"),
                        "target_year": co.get("targetYear"),
                        "company_id": co.get("id"),
                        "source": "SBTi API",
                    }
                    cache_set_esg(f"sbti:{company_name}", result)
                    return result
    except Exception:
        pass

    result = {"has_sbti_target": False, "sbti_status": "Not found", "source": "SBTi (not found)"}
    cache_set_esg(f"sbti:{company_name}", result)
    return result


async def fetch_company_water_usage(company_name: str) -> dict:
    """
    Retrieve reported water usage from CDP-style disclosure.
    For now uses SEC EDGAR proxy (CDP full API requires registration).
    Returns water intensity signals derived from 10-K language.
    """
    sec = await fetch_sec_risk_disclosure(company_name)
    intensity = "Unknown"
    if sec["water_mentions"] >= 5:
        intensity = "High Disclosure"
    elif sec["water_mentions"] >= 2:
        intensity = "Moderate Disclosure"
    elif sec["water_mentions"] >= 1:
        intensity = "Low Disclosure"
    else:
        intensity = "Not Disclosed"

    return {
        "company": company_name,
        "disclosure_intensity": intensity,
        "sec_water_mentions": sec["water_mentions"],
        "source": "SEC EDGAR 10-K proxy",
        "note": "Full CDP data requires registration at cdp.net",
    }


async def calculate_esg_viability(company_name: str) -> dict:
    """
    Combined ESG viability score (0–100).
    40 pts: SBTi commitment
    40 pts: SEC water mentions (capped)
    20 pts: has_water_esg flag
    """
    sec, sbti = await _gather(
        fetch_sec_risk_disclosure(company_name),
        fetch_sbti_status(company_name),
    )

    score = 0.0
    score += 40.0 if sbti["has_sbti_target"] else 0.0
    score += min(40.0, sec["water_mentions"] * 8.0)
    score += 20.0 if sec["has_water_esg"] else 0.0

    return {
        "esg_score": round(min(100.0, score), 1),
        "has_sbti_target": sbti["has_sbti_target"],
        "sbti_status": sbti["sbti_status"],
        "water_mentions_10k": sec["water_mentions"],
        "has_water_esg": sec["has_water_esg"],
        "sources": ["SEC EDGAR", "SBTi"],
    }


async def _gather(*coros):
    import asyncio
    return await asyncio.gather(*coros)
