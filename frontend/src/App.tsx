import { useEffect, useState, useCallback } from "react";
import type { Building, CVBuilding, FilterState, Stats } from "./types";
import { fetchBuildings, fetchStats } from "./api";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import MapView from "./components/Map";
import BuildingDetail from "./components/BuildingDetail";

const DEFAULT_FILTERS: FilterState = {
  minScore: 0,
  maxScore: 100,
  buildingTypes: [],
  esgOnly: false,
};

export default function App() {
  const [buildings, setBuildings]     = useState<Building[]>([]);
  const [stats, setStats]             = useState<Stats | null>(null);
  const [filters, setFilters]         = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBuildings({
      min_score:     filters.minScore,
      max_score:     filters.maxScore,
      building_type: filters.buildingTypes.length ? filters.buildingTypes.join(",") : undefined,
      esg_only:      filters.esgOnly || undefined,
    })
      .then(setBuildings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  const selectedBuilding = buildings.find((b) => b.id === selectedId) ?? null;

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDetect = useCallback((detected: CVBuilding[]) => {
    if (detected.length === 0) {
      fetchStats().then(setStats).catch(console.error);
      return;
    }
    const scores = detected.map((b) => b.score);
    const total_annual_value = detected.reduce((sum, b) => sum + b.annual_value, 0);
    setStats({
      total_buildings: detected.length,
      avg_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
      max_score: Math.max(...scores),
      total_annual_value,
      high_viability_count:   scores.filter((s) => s >= 67).length,
      medium_viability_count: scores.filter((s) => s >= 33 && s < 67).length,
      low_viability_count:    scores.filter((s) => s < 33).length,
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Header
        stats={stats}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Loading bar */}
        {loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-30">
            <div className="h-full bg-sky-500 animate-pulse" />
          </div>
        )}

        {sidebarOpen && (
          <Sidebar filters={filters} onChange={setFilters} />
        )}

        <MapView
          buildings={buildings}
          selectedId={selectedId}
          onSelect={handleSelect}
          onDetect={handleDetect}
        />

        {selectedBuilding && (
          <BuildingDetail
            building={selectedBuilding}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
