export type BuildingType =
  | "office"
  | "retail"
  | "industrial"
  | "mixed-use"
  | "warehouse";

export interface ScoreBreakdown {
  base_score: number;
  esg_multiplier: number;
  final_score: number;
}

export interface BuildingScore {
  total: number;
  annual_value: number;
  harvestable_m3: number;
  annual_rainfall_mm: number;
  water_price_per_m3: number;
  has_sbti_target: boolean;
  mentions_water_esg: boolean;
  rebate_available: number;
  payback_years: number;
  breakdown: ScoreBreakdown;
  monthly_rainfall_mm: number[];   // Jan–Dec
  monthly_harvest_m3: number[];    // Jan–Dec
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  roof_area_m2: number;
  floors: number;
  building_type: BuildingType;
  score: BuildingScore;
  geometry: GeoJSONPolygon;
}

export interface FilterState {
  minScore: number;
  maxScore: number;
  buildingTypes: BuildingType[];
  esgOnly: boolean;
}

export interface Stats {
  total_buildings: number;
  avg_score: number;
  max_score: number;
  total_annual_value: number;
  high_viability_count: number;
  medium_viability_count: number;
  low_viability_count: number;
}

export interface RainfallGridMeta {
  year: number;
  min_mm: number;
  max_mm: number;
  year_label: string;
}

export interface RainfallGrid {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { rainfall_mm: number; year: number };
  }>;
  meta: RainfallGridMeta;
}

export interface CVBuilding {
  osm_id: number;
  geometry: object;
  area_m2: number;
  sqft: number;
  confidence: number;
  cooling_tower: boolean;
  score: number;
  annual_value: number;
  harvestable_m3: number;
  payback_years: number;
  rebate_available: number;
}

// ── Global Climate Heatmap types ─────────────────────────────────────────────

export type ClimateDataSource = "precipitation" | "drought" | "water_stress" | "resilience" | "combined";

export interface ClimateCell {
  precipitation_mm: number;
  precipitation_anomaly_pct: number;
  water_stress_index: number;
  drought_severity: number;
  flood_risk_pct: number;
  temperature_anomaly_c: number;
  combined_heatmap_value: number;
  data_source: string;
}

export interface ClimateGrid {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: ClimateCell;
  }>;
  meta: {
    datasource: ClimateDataSource;
    resolution_deg: number;
    cells: number;
    min_value: number;
    max_value: number;
  };
}

export interface ClimateDetail {
  lat: number;
  lon: number;
  precipitation: {
    annual_avg_mm: number;
    monthly_avg_mm: number[];
    source: string;
  };
  forecast: {
    dates: string[];
    precipitation_mm: (number | null)[];
    precipitation_probability: (number | null)[];
    source: string;
  };
  financial: {
    financial_viability_coefficient: number;
    water_cost: { water_cost_per_m3: number; currency: string; source: string };
    stormwater_fee: { fee_per_sqft_impervious_usd: number; source: string };
    incentives: Array<{ name: string; type: string; value: string; citation?: string; url?: string }>;
    annual_water_savings_usd: number | null;
  };
  resilience: {
    resilience_score: number;
    opportunity_level: "High" | "Medium" | "Low";
    annual_precip_mm: number;
    climate_exposure: number;
    precip_opportunity: number;
  };
}

export function scoreColor(score: number): string {
  if (score >= 67) return "#22c55e";
  if (score >= 33) return "#f59e0b";
  return "#ef4444";
}

export function scoreLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 67) return "High";
  if (score >= 33) return "Medium";
  return "Low";
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
