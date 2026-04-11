import { SlidersHorizontal, Leaf, Building2, Factory, ShoppingBag, Warehouse, Blend } from "lucide-react";
import type { BuildingType, FilterState } from "../types";

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

const TYPE_OPTIONS: { value: BuildingType; label: string; icon: React.ReactNode }[] = [
  { value: "office",     label: "Office",     icon: <Building2 className="w-3.5 h-3.5" /> },
  { value: "retail",     label: "Retail",     icon: <ShoppingBag className="w-3.5 h-3.5" /> },
  { value: "industrial", label: "Industrial", icon: <Factory className="w-3.5 h-3.5" /> },
  { value: "mixed-use",  label: "Mixed-use",  icon: <Blend className="w-3.5 h-3.5" /> },
  { value: "warehouse",  label: "Warehouse",  icon: <Warehouse className="w-3.5 h-3.5" /> },
];

export default function Sidebar({ filters, onChange }: Props) {
  function toggleType(t: BuildingType) {
    const has = filters.buildingTypes.includes(t);
    onChange({
      ...filters,
      buildingTypes: has
        ? filters.buildingTypes.filter((x) => x !== t)
        : [...filters.buildingTypes, t],
    });
  }

  return (
    <aside className="glass flex flex-col gap-5 w-72 shrink-0 p-4 overflow-y-auto scrollbar-thin z-10">
      {/* Header */}
      <div className="flex items-center gap-2 text-slate-300">
        <SlidersHorizontal className="w-4 h-4 text-sky-400" />
        <span className="font-semibold text-sm">Filter Buildings</span>
      </div>

      {/* Score range */}
      <Section title="Viability Score">
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Min: <ScoreBadge score={filters.minScore} /></span>
            <span>Max: <ScoreBadge score={filters.maxScore} /></span>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-500">Minimum</label>
            <input
              type="range" min={0} max={100} step={1}
              value={filters.minScore}
              onChange={(e) => onChange({ ...filters, minScore: Number(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-500">Maximum</label>
            <input
              type="range" min={0} max={100} step={1}
              value={filters.maxScore}
              onChange={(e) => onChange({ ...filters, maxScore: Number(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>
        </div>
        {/* Score legend */}
        <div className="flex gap-2 mt-2">
          <Legend color="bg-red-500"     label="Low  0–32" />
          <Legend color="bg-amber-500"   label="Med 33–66" />
          <Legend color="bg-emerald-500" label="High 67+" />
        </div>
      </Section>

      {/* Building types */}
      <Section title="Building Type">
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((opt) => {
            const active = filters.buildingTypes.length === 0 || filters.buildingTypes.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggleType(opt.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
                  active
                    ? "bg-sky-500/20 border-sky-500/50 text-sky-300"
                    : "bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
        {filters.buildingTypes.length > 0 && (
          <button
            onClick={() => onChange({ ...filters, buildingTypes: [] })}
            className="text-xs text-slate-500 hover:text-slate-300 mt-1 transition-colors"
          >
            Clear type filter
          </button>
        )}
      </Section>

      {/* ESG toggle */}
      <Section title="ESG Signals">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Leaf className="w-4 h-4 text-emerald-400" />
            ESG-committed only
          </div>
          <div
            onClick={() => onChange({ ...filters, esgOnly: !filters.esgOnly })}
            className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${
              filters.esgOnly ? "bg-emerald-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                filters.esgOnly ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
        </label>
        <p className="text-xs text-slate-500 mt-1">
          Shows buildings with SBTi targets or water-ESG SEC filings
        </p>
      </Section>

      {/* Reset */}
      <button
        onClick={() => onChange({ minScore: 0, maxScore: 100, buildingTypes: [], esgOnly: false })}
        className="mt-auto py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        Reset all filters
      </button>

      {/* Data sources footer */}
      <div className="text-xs text-slate-600 space-y-0.5">
        <p className="font-medium text-slate-500">Data sources</p>
        <p>Footprints · Overture Maps</p>
        <p>Rainfall · Open-Meteo Archive</p>
        <p>ESG · SBTi Excel + SEC EDGAR</p>
        <p>Prices · State-level lookup</p>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 67 ? "text-emerald-400" : score >= 33 ? "text-amber-400" : "text-red-400";
  return <span className={`font-mono font-semibold ${color}`}>{score}</span>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1 text-xs text-slate-400">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      {label}
    </div>
  );
}
