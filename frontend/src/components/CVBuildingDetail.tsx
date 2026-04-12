import { X, Droplets, DollarSign, RotateCcw, TrendingUp, Zap, Wind } from "lucide-react";
import type { CVBuilding } from "../types";
import { scoreColor, scoreLabel } from "../types";
import ScoreGauge from "./ScoreGauge";

interface Props {
  building: CVBuilding;
  onClose: () => void;
}

export default function CVBuildingDetail({ building: b, onClose }: Props) {
  const gallons = Math.round(b.harvestable_m3 * 264.172);
  const installCost = b.harvestable_m3 * 2.5;
  const isPrimaryTarget = b.sqft >= 100_000;

  return (
    <aside className="glass flex flex-col w-[460px] shrink-0 overflow-hidden z-10 h-full overflow-y-auto scrollbar-thin">
      {/* ── Header ── */}
      <div className="flex items-start justify-between p-4 border-b border-slate-700/60 shrink-0">
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-slate-100 leading-tight">Detected Building</h2>
            {isPrimaryTarget && (
              <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-emerald-500/15 text-emerald-400 border-emerald-500/40">
                ✅ PRIMARY TARGET
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">OSM ID: {b.osm_id}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-slate-300 font-mono font-medium">
              {b.sqft.toLocaleString()} ft²
            </span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-500">{b.area_m2.toLocaleString()} m²</span>
            <span className="text-xs text-slate-500">·</span>
            <ConfidenceBadge confidence={b.confidence} />
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-5">
          {/* Score gauge */}
          <div className="flex flex-col items-center py-2">
            <ScoreGauge score={b.score} size={150} />
            <p className="text-xs text-slate-500 mt-2 text-center px-4 max-w-xs">
              Viability score based on roof area and local Austin rainfall — no ESG data available for detected buildings
            </p>
          </div>

          {/* Metric grid */}
          <div className="grid grid-cols-2 gap-2">
            <Metric
              icon={<DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
              label="Est. Annual Savings"
              value={`$${b.annual_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              highlight
            />
            <Metric
              icon={<Droplets className="w-3.5 h-3.5 text-sky-400" />}
              label="Annual Harvest"
              value={`${gallons.toLocaleString()} gal`}
            />
            <Metric
              icon={<RotateCcw className="w-3.5 h-3.5 text-violet-400" />}
              label="Est. Payback"
              value={b.payback_years >= 99 ? "N/A" : `${b.payback_years} yrs`}
            />
            <Metric
              icon={<TrendingUp className="w-3.5 h-3.5 text-amber-400" />}
              label="TX Rebate Available"
              value={`$${b.rebate_available.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
          </div>

          {/* Viability score detail */}
          <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-400">Viability Score</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold font-mono" style={{ color: scoreColor(b.score) }}>
                {Math.round(b.score)}/100
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded border font-medium"
                style={{
                  color: scoreColor(b.score),
                  background: scoreColor(b.score) + "22",
                  borderColor: scoreColor(b.score) + "44",
                }}
              >
                {scoreLabel(b.score)}
              </span>
            </div>
          </div>

          {/* Harvest detail */}
          <div className="space-y-2">
            <SectionLabel>Harvest Breakdown</SectionLabel>
            <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 divide-y divide-slate-700/40">
              <DetailRow label="Roof Area" value={`${b.area_m2.toLocaleString()} m²`} />
              <DetailRow label="Roof Area (imperial)" value={`${b.sqft.toLocaleString()} ft²`} />
              <DetailRow label="Annual Harvest (m³)" value={`${b.harvestable_m3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³`} />
              <DetailRow label="Annual Harvest (gal)" value={`${gallons.toLocaleString()} gal`} />
            </div>
          </div>

          {/* Cooling tower */}
          <div className="rounded-lg border px-3 py-2.5 flex items-center gap-3"
            style={{
              background: b.cooling_tower ? "rgba(6,182,212,0.08)" : "rgba(30,41,59,0.5)",
              borderColor: b.cooling_tower ? "rgba(6,182,212,0.3)" : "rgba(51,65,85,0.4)",
            }}
          >
            <Wind className={`w-4 h-4 shrink-0 ${b.cooling_tower ? "text-cyan-400" : "text-slate-600"}`} />
            <div>
              <p className={`text-sm font-semibold ${b.cooling_tower ? "text-cyan-400" : "text-slate-400"}`}>
                Cooling Tower: {b.cooling_tower ? "Detected" : "Not Detected"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {b.cooling_tower
                  ? "Cooling tower present — additional water recycling opportunity."
                  : "No cooling tower detected in this footprint."}
              </p>
            </div>
          </div>

          {/* Install cost */}
          <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 px-3 py-2.5 space-y-1">
            <SectionLabel>Estimated Install Cost</SectionLabel>
            <p className="text-lg font-bold text-slate-200">
              ${installCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-slate-500">Based on $2.50/m³ harvesting capacity (industry avg for commercial)</p>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="p-3 border-t border-slate-700/60 shrink-0">
        <button
          className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2"
          style={{
            background: scoreColor(b.score) + "22",
            color: scoreColor(b.score),
            border: `1px solid ${scoreColor(b.score)}44`,
          }}
          onClick={() => alert(`Generating Grundfos proposal for OSM building ${b.osm_id}…`)}
        >
          <Zap className="w-4 h-4" />
          Generate Grundfos Proposal
        </button>
      </div>
    </aside>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function Metric({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`font-semibold text-sm ${highlight ? "text-emerald-400" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-3 py-2 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 font-mono">{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 90 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
    : confidence >= 80 ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
    : "bg-slate-700/50 text-slate-400 border-slate-700";
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${color}`}>
      {confidence}% confidence
    </span>
  );
}
