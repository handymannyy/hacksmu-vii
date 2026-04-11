import type { Building, Stats, RainfallGrid } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

async function get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface BuildingsParams {
  min_score?: number;
  max_score?: number;
  building_type?: string;
  esg_only?: boolean;
}

export async function fetchBuildings(params: BuildingsParams = {}): Promise<Building[]> {
  const data = await get<{ buildings: Building[]; total: number }>("/buildings", params as Record<string, string | number | boolean>);
  return data.buildings;
}

export async function fetchBuilding(id: string): Promise<Building> {
  return get<Building>(`/buildings/${id}`);
}

export async function fetchStats(): Promise<Stats> {
  return get<Stats>("/stats");
}

export async function fetchRainfallGrid(year: number = 2023): Promise<RainfallGrid> {
  return get<RainfallGrid>("/rainfall-grid", { year });
}
