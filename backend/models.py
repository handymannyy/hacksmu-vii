from pydantic import BaseModel
from typing import List, Any


class ScoreBreakdown(BaseModel):
    base_score: float
    esg_multiplier: float
    final_score: float


class BuildingScore(BaseModel):
    total: float
    annual_value: float
    harvestable_m3: float
    annual_rainfall_mm: float
    water_price_per_m3: float
    has_sbti_target: bool
    mentions_water_esg: bool
    rebate_available: float
    payback_years: float
    breakdown: ScoreBreakdown
    monthly_rainfall_mm: List[float]   # 12 values, Jan–Dec
    monthly_harvest_m3: List[float]    # 12 values, Jan–Dec


class Building(BaseModel):
    id: str
    name: str
    address: str
    city: str
    state: str
    lat: float
    lon: float
    roof_area_m2: float
    floors: int
    building_type: str
    score: BuildingScore
    geometry: Any  # GeoJSON Polygon {"type":"Polygon","coordinates":[[[lon,lat],...]]}


class BuildingsResponse(BaseModel):
    buildings: List[Building]
    total: int


class RainfallResponse(BaseModel):
    lat: float
    lon: float
    annual_mm: float
    monthly_mm: List[float]
    source: str
