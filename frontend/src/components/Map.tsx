import { useRef, useCallback, useState, useEffect } from "react";
import ReactMapGL, {
  Source,
  Layer,
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Layers, Droplets, Building2, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SearchBar } from "./ui/search-bar";
import type { Building, CVBuilding, RainfallGrid } from "../types";
import { fetchRainfallGrid } from "../api";
import CVBuildingDetail from "./CVBuildingDetail";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

const YEARS = [2020, 2021, 2022, 2023, 2024] as const;
const YEAR_LABELS: Record<number, string> = {
  2020: "2020 — La Niña dry",
  2021: "2021 — Wet recovery",
  2022: "2022 — Severe drought",
  2023: "2023 — Near-normal",
  2024: "2024 — Slightly above avg",
};

// Data-driven fill color: score → green/amber/red
const fillColor = [
  "interpolate", ["linear"], ["get", "score"],
  0,   "#ef4444",
  33,  "#f97316",
  66,  "#f59e0b",
  100, "#22c55e",
] as unknown as mapboxgl.Expression;

// Convert buildings to a GeoJSON FeatureCollection of Polygon features
function toPolygonGeoJSON(buildings: Building[]) {
  return {
    type: "FeatureCollection" as const,
    features: buildings.map((b) => ({
      type: "Feature" as const,
      id: b.id,
      geometry: b.geometry,
      properties: {
        id: b.id,
        name: b.name,
        score: b.score.total,
        annual_value: b.score.annual_value,
        roof_area_m2: b.roof_area_m2,
        building_type: b.building_type,
      },
    })),
  };
}

// Centroid point source for labels
function toCentroidGeoJSON(buildings: Building[]) {
  return {
    type: "FeatureCollection" as const,
    features: buildings.map((b) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [b.lon, b.lat] },
      properties: { id: b.id, score: b.score.total, name: b.name },
    })),
  };
}

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  score: number;
  annual_value: number;
  roof_area_m2: number;
  building_type: string;
}

interface Props {
  buildings: Building[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDetect: (buildings: CVBuilding[]) => void;
  onLocationChange: (label: string) => void;
}

export default function MapView({ buildings, selectedId, onSelect, onDetect, onLocationChange }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Layer controls
  const [showRainfall, setShowRainfall] = useState(false);
  const [showFootprints, setShowFootprints] = useState(true);
  const [rainfallYear, setRainfallYear] = useState(2023);
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [rainfallData, setRainfallData] = useState<RainfallGrid | null>(null);
  const [detectedBuildings, setDetectedBuildings] = useState<CVBuilding[]>([]);
  const [selectedCVBuilding, setSelectedCVBuilding] = useState<CVBuilding | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [rainfallLoading, setRainfallLoading] = useState(false);
  const handleSearchRetrieve = useCallback(
    (lng: number, lat: number, label: string) => {
      if (!mapRef.current) return;
      mapRef.current.flyTo({ center: [lng, lat], zoom: 13, duration: 1800 });
      setDetectedBuildings([]);
      setSelectedCVBuilding(null);
      onDetect([]);
      if (label) onLocationChange(label);
    },
    [onDetect, onLocationChange]
  );

  const runDetection = useCallback(async () => {
  if (!mapRef.current) return;
  const bounds = mapRef.current.getBounds();
  if (!bounds) return;
  const zoom = mapRef.current.getZoom();
  if (zoom < 13) return;
  setDetecting(true);
  try {
    const url = new URL(`${API_BASE}/detect`, window.location.origin);
    url.searchParams.set("south", String(bounds.getSouth()));
    url.searchParams.set("west", String(bounds.getWest()));
    url.searchParams.set("north", String(bounds.getNorth()));
    url.searchParams.set("east", String(bounds.getEast()));
    const res = await fetch(url.toString());
    const data = await res.json();
    const detected: CVBuilding[] = data.buildings || [];
    setDetectedBuildings(detected);
    onDetect(detected);
  } catch (e) {
    console.error(e);
  } finally {
    setDetecting(false);
  }
}, [onDetect]);

  useEffect(() => {
    if (!showRainfall) return;
    setRainfallLoading(true);
    fetchRainfallGrid(rainfallYear)
      .then(setRainfallData)
      .catch(console.error)
      .finally(() => setRainfallLoading(false));
  }, [showRainfall, rainfallYear]);

  const polygonGeoJSON = toPolygonGeoJSON(buildings);
  const centroidGeoJSON = toCentroidGeoJSON(buildings);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const feat = e.features?.[0];
    if (feat?.layer?.id === "buildings-fill" && feat.properties) {
      setHover({
        x: e.point.x,
        y: e.point.y,
        name: feat.properties.name as string,
        score: feat.properties.score as number,
        annual_value: feat.properties.annual_value as number,
        roof_area_m2: feat.properties.roof_area_m2 as number,
        building_type: feat.properties.building_type as string,
      });
    } else {
      setHover(null);
    }
  }, []);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat?.properties) return;
      if (feat.layer?.id === "cv-buildings-fill") {
        const osmId = feat.properties.osm_id as number;
        const cvb = detectedBuildings.find((b) => b.osm_id === osmId) ?? null;
        setSelectedCVBuilding(cvb);
      } else if (feat.properties.id) {
        setSelectedCVBuilding(null);
        onSelect(feat.properties.id as string);
      }
    },
    [onSelect, detectedBuildings]
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="glass rounded-xl p-8 max-w-sm text-center space-y-3">
          <p className="text-amber-400 font-semibold">Mapbox Token Required</p>
          <p className="text-slate-400 text-sm">
            Add <code className="text-sky-400 bg-slate-800 px-1 rounded">VITE_MAPBOX_TOKEN=pk....</code> to{" "}
            <code className="text-sky-400 bg-slate-800 px-1 rounded">frontend/.env</code>
          </p>
          <p className="text-slate-500 text-xs">Free at mapbox.com — 50K loads/month.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <ReactMapGL
        ref={mapRef}
        initialViewState={{ latitude: 30.305, longitude: -97.743, zoom: 10.5, pitch: 30, bearing: -8 }}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactiveLayerIds={[
          ...(showFootprints ? ["buildings-fill"] : []),
          ...(detectedBuildings.length > 0 ? ["cv-buildings-fill"] : []),
        ]}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
        style={{ width: "100%", height: "100%" }}
        cursor={hover ? "pointer" : "grab"}
      >
        <NavigationControl position="bottom-right" />

        {/* ── Location search ── */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-80">
          <SearchBar
            accessToken={MAPBOX_TOKEN}
            onRetrieve={handleSearchRetrieve}
            placeholder="Search location..."
          />
        </div>

        {/* ── Scan button / scanning badge (centered below search bar) ── */}
        <div className="absolute top-[54px] left-1/2 -translate-x-1/2 z-10 w-max">
          <AnimatePresence mode="wait">
            {detecting ? (
              <motion.div
                key="badge"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium pointer-events-none"
                style={{
                  background: "rgba(0, 245, 255, 0.08)",
                  border: "1px solid rgba(0, 245, 255, 0.3)",
                  backdropFilter: "blur(12px)",
                  color: "#00f5ff",
                }}
              >
                <motion.span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "#00f5ff" }}
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                />
                Scanning area...
              </motion.div>
            ) : (
              <motion.button
                key="button"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                onClick={runDetection}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-white shadow-lg"
              >
                Scan Area
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── Rainfall heatmap ── */}
        {showRainfall && rainfallData && (
          <Source id="rainfall" type="geojson" data={rainfallData}>
            <Layer
              id="rainfall-heatmap"
              type="heatmap"
              paint={{
                "heatmap-weight": [
                  "interpolate", ["linear"], ["get", "rainfall_mm"],
                  400, 0,
                  863, 0.5,
                  1100, 1,
                ],
                "heatmap-intensity": 1.2,
                "heatmap-color": [
                  "interpolate", ["linear"], ["heatmap-density"],
                  0,   "rgba(255,230,100,0)",
                  0.15,"rgba(255,230,100,0.35)",
                  0.40,"rgba(100,190,255,0.55)",
                  0.70,"rgba(30,100,255,0.65)",
                  1,   "rgba(0,30,180,0.75)",
                ],
                "heatmap-radius": 55,
                "heatmap-opacity": 0.72,
              }}
            />
          </Source>
        )}

        {/* ── CV Detected Buildings ── */}
{detectedBuildings.length > 0 && (
  <Source
    id="cv-buildings"
    type="geojson"
    data={{
      type: "FeatureCollection",
      features: detectedBuildings.map((b) => ({
        type: "Feature",
        geometry: b.geometry,
        properties: {
          osm_id: b.osm_id,
          sqft: b.sqft,
          confidence: b.confidence,
          score: b.score,
          annual_value: b.annual_value,
        },
      })),
    }}
  >
    <Layer
      id="cv-buildings-fill"
      type="fill"
      paint={{
        "fill-color": "#00f5ff",
        "fill-opacity": 0.25,
      }}
    />
    <Layer
      id="cv-buildings-outline"
      type="line"
      paint={{
        "line-color": "#00f5ff",
        "line-width": 2,
        "line-opacity": 0.9,
      }}
    />
  </Source>
)}

        {/* ── Building polygon footprints ── */}
        {showFootprints && (
          <Source id="buildings" type="geojson" data={polygonGeoJSON}>
            {/* Fill */}
            <Layer
              id="buildings-fill"
              type="fill"
              paint={{
                "fill-color": fillColor,
                "fill-opacity": [
                  "case",
                  ["==", ["get", "id"], selectedId ?? ""],
                  0.95,
                  0.75,
                ],
              }}
            />
            {/* Outline — always visible */}
            <Layer
              id="buildings-outline"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "id"], selectedId ?? ""],
                  "#38bdf8",
                  "rgba(255,255,255,0.3)",
                ],
                "line-width": [
                  "case",
                  ["==", ["get", "id"], selectedId ?? ""],
                  3,
                  1,
                ],
              }}
            />
          </Source>
        )}

        {/* ── Score labels (shown at zoom ≥ 12) ── */}
        <Source id="centroids" type="geojson" data={centroidGeoJSON}>
          <Layer
            id="score-labels"
            type="symbol"
            minzoom={12}
            layout={{
              "text-field": ["number-format", ["get", "score"], { "max-fraction-digits": 0 }],
              "text-size": 11,
              "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
              "text-allow-overlap": false,
            }}
            paint={{
              "text-color": "#fff",
              "text-halo-color": "rgba(0,0,0,0.7)",
              "text-halo-width": 1.5,
            }}
          />
        </Source>
      </ReactMapGL>

      {/* ── Layer controls panel ── */}
      <div className="absolute top-3 left-3 glass rounded-xl overflow-hidden z-10 w-56">
        <button
          onClick={() => setLayerPanelOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-white/5 transition-colors"
        >
          <Layers className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs font-semibold flex-1 text-left">Map Layers</span>
          {layerPanelOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {layerPanelOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-slate-700/60">
            {/* Footprints toggle */}
            <LayerToggle
              icon={<Building2 className="w-3.5 h-3.5 text-emerald-400" />}
              label="Building Footprints"
              sub="Scored polygons"
              active={showFootprints}
              onChange={setShowFootprints}
            />

            {/* Rainfall toggle */}
            <LayerToggle
              icon={<Droplets className="w-3.5 h-3.5 text-sky-400" />}
              label="Rainfall Heatmap"
              sub="Historical precipitation"
              active={showRainfall}
              onChange={setShowRainfall}
              loading={rainfallLoading}
            />

            {/* Year selector (only when rainfall is on) */}
            {showRainfall && (
              <div className="space-y-1.5 pt-1 border-t border-slate-700/40">
                <p className="text-xs text-slate-500 font-medium">Historical year</p>
                <div className="flex flex-wrap gap-1">
                  {YEARS.map((y) => (
                    <button
                      key={y}
                      onClick={() => setRainfallYear(y)}
                      className={`px-2 py-0.5 rounded text-xs font-mono transition-all ${
                        rainfallYear === y
                          ? "bg-sky-500 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">{YEAR_LABELS[rainfallYear]}</p>

                {/* Rainfall legend */}
                <div className="mt-1">
                  <div
                    className="h-2 rounded w-full"
                    style={{ background: "linear-gradient(to right, #ffe664, #64beff, #1e64ff, #001eb4)" }}
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                    <span>Dry</span>
                    <span>Wet</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Score legend ── */}
      <div className="glass absolute bottom-14 left-3 rounded-lg px-3 py-2 text-xs space-y-1 z-10">
        <p className="text-slate-400 font-semibold mb-1">Viability Score</p>
        {[
          { color: "#22c55e", label: "High  67–100" },
          { color: "#f59e0b", label: "Med   33–66" },
          { color: "#ef4444", label: "Low   0–32" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2 text-slate-400">
            <span className="w-3 h-3 rounded-sm flex-shrink-0 opacity-80" style={{ background: color }} />
            <span className="font-mono">{label}</span>
          </div>
        ))}
        <p className="text-slate-600 pt-0.5 border-t border-slate-800 mt-1">Polygon size = roof area</p>
      </div>

      {/* ── Scan pulse overlay ── */}
      <AnimatePresence>
        {detecting && (
          <motion.div
            className="absolute inset-0 pointer-events-none z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.12, 0.04, 0.1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
            style={{ background: "rgba(0, 245, 255, 1)" }}
          />
        )}
      </AnimatePresence>

      {/* ── CV Building detail panel ── */}
      {selectedCVBuilding && (
        <div className="absolute right-0 top-0 h-full z-20 flex">
          <CVBuildingDetail
            building={selectedCVBuilding}
            onClose={() => setSelectedCVBuilding(null)}
          />
        </div>
      )}

      {/* ── Hover tooltip ── */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: hover.x + 14, top: hover.y - 8 }}
        >
          <div className="glass rounded-lg px-3 py-2 text-xs min-w-[170px] shadow-xl">
            <p className="font-semibold text-slate-100 truncate max-w-[190px] mb-1">{hover.name}</p>
            <TooltipRow label="Score"     value={`${Math.round(hover.score)}/100`}   score={hover.score} />
            <TooltipRow label="Value"     value={`$${hover.annual_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`} />
            <TooltipRow label="Roof area" value={`${hover.roof_area_m2.toLocaleString()} m²`} />
            <TooltipRow label="Type"      value={hover.building_type} />
          </div>
        </div>
      )}
    </div>
  );
}

function LayerToggle({
  icon, label, sub, active, onChange, loading,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  active: boolean;
  onChange: (v: boolean) => void;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <div className="min-w-0">
          <p className="text-xs text-slate-200 font-medium">{label}</p>
          <p className="text-[10px] text-slate-500">{loading ? "Loading…" : sub}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!active)}
        className={`w-8 h-4 rounded-full relative flex-shrink-0 transition-colors ${active ? "bg-sky-500" : "bg-slate-700"}`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${active ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

function TooltipRow({ label, value, score }: { label: string; value: string; score?: number }) {
  const cls = score !== undefined
    ? score >= 67 ? "text-emerald-400" : score >= 33 ? "text-amber-400" : "text-red-400"
    : "text-slate-300";
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono ${cls}`}>{value}</span>
    </div>
  );
}
