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
