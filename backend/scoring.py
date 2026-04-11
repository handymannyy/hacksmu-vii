def score_building(
    roof_area_m2: float,
    annual_rainfall_mm: float,
    water_price_per_m3: float,
    has_sbti_target: bool = False,
    mentions_water_esg: bool = False,
    install_cost_per_m3_capacity: float = 2.50,
) -> dict:
    """
    Calculate rainwater harvesting viability score (0–100) and financial metrics.

    Formula from RainUSE Nexus design spec:
      harvestable_m3 = roof_area * (rainfall_mm/1000) * 0.85 runoff coefficient
      annual_value   = harvestable_m3 * water_price_per_m3
      base_score     = min(100, annual_value / 50_000 * 100)
      ESG bonuses    = +15% SBTi target, +10% water ESG mention in SEC filings
    """
    rainfall_m = annual_rainfall_mm / 1000.0
    harvestable_m3 = roof_area_m2 * rainfall_m * 0.85
    annual_value = harvestable_m3 * water_price_per_m3

    base_score = min(100.0, (annual_value / 50_000.0) * 100.0)

    esg_multiplier = 1.0
    if has_sbti_target:
        esg_multiplier *= 1.15
    if mentions_water_esg:
        esg_multiplier *= 1.10

    final_score = min(100.0, round(base_score * esg_multiplier, 1))

    # Payback period assuming install cost scales with annual harvest capacity
    install_cost = harvestable_m3 * install_cost_per_m3_capacity
    payback_years = round(install_cost / annual_value, 1) if annual_value > 0 else 99.9

    # Texas/Austin rebate: $0.75/gallon avg, capped at $5,000
    rebate_available = round(min(5_000.0, harvestable_m3 * 264.172 * 0.75), 2)

    return {
        "total": final_score,
        "annual_value": round(annual_value, 2),
        "harvestable_m3": round(harvestable_m3, 2),
        "annual_rainfall_mm": annual_rainfall_mm,
        "water_price_per_m3": water_price_per_m3,
        "has_sbti_target": has_sbti_target,
        "mentions_water_esg": mentions_water_esg,
        "rebate_available": rebate_available,
        "payback_years": payback_years,
        "breakdown": {
            "base_score": round(base_score, 1),
            "esg_multiplier": round(esg_multiplier, 2),
            "final_score": final_score,
        },
    }
