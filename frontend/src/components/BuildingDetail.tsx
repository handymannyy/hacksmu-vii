import { useState } from "react";
import {
  X, Droplets, DollarSign, RotateCcw, TrendingUp,
  Leaf, FileText, Zap, BarChart3, LineChart, Info,
} from "lucide-react";
import type { Building } from "../types";
import { scoreColor, MONTHS } from "../types";
import ScoreGauge from "./ScoreGauge";

interface Props {
  building: Building;
  onClose: () => void;
}

type Tab = "overview" | "charts" | "esg";

export default function BuildingDetail({ building: b, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const { score: s } = b;
  const gallons = Math.round(s.harvestable_m3 * 264.172);
  const installCost = s.harvestable_m3 * 2.5;

  return (
    <aside className="glass flex flex-col w-[460px] shrink-0 overflow-hidden z-10">
      {/* ── Header ── */}
      <div className="flex items-start justify-between p-4 border-b border-slate-700/60 shrink-0">
        <div className="flex-1 min-w-0 pr-2">
          <h2 className="font-semibold text-slate-100 leading-tight">{b.name}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{b.address} · {b.city}, {b.state}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <TypeBadge type={b.building_type} />
            <span className="text-xs text-slate-500">{b.floors}F</span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-300 font-mono font-medium">
              {b.roof_area_m2.toLocaleString()} m²
            </span>
            <span className="text-xs text-slate-500">
              ({Math.round(b.roof_area_m2 * 10.764).toLocaleString()} ft²)
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-700/60 shrink-0">
        {(["overview", "charts", "esg"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? "text-sky-400 border-b-2 border-sky-400 -mb-px"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "charts" ? (
              <span className="flex items-center justify-center gap-1"><BarChart3 className="w-3 h-3" />Charts</span>
            ) : t === "esg" ? (
              <span className="flex items-center justify-center gap-1"><Leaf className="w-3 h-3" />ESG</span>
            ) : (
              <span className="flex items-center justify-center gap-1"><Info className="w-3 h-3" />Overview</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "overview" && <OverviewTab b={b} gallons={gallons} installCost={installCost} />}
        {tab === "charts"   && <ChartsTab b={b} installCost={installCost} />}
        {tab === "esg"      && <EsgTab b={b} />}
      </div>

      {/* ── CTA ── */}
      <div className="p-3 border-t border-slate-700/60 shrink-0">
        <button
          className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2"
          style={{ background: scoreColor(s.total) + "22", color: scoreColor(s.total), border: `1px solid ${scoreColor(s.total)}44` }}
          onClick={() => alert(`Generating full Grundfos proposal for ${b.name}…`)}
        >
          <Zap className="w-4 h-4" />
          Generate Grundfos Proposal
        </button>
      </div>
    </aside>
  );
}

// ── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ b, gallons, installCost }: { b: Building; gallons: number; installCost: number }) {
  const s = b.score;
  return (
    <div className="p-4 space-y-5">
      {/* Score gauge */}
      <div className="flex flex-col items-center py-2">
        <ScoreGauge score={s.total} size={150} />
        <p className="text-xs text-slate-500 mt-2 text-center px-4 max-w-xs">
          Composite viability score based on roof area, local rainfall, commercial water rates, and ESG commitments
        </p>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-2">
        <Metric icon={<DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
          label="Est. Annual Value"  value={`$${s.annual_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} highlight />
        <Metric icon={<Droplets className="w-3.5 h-3.5 text-sky-400" />}
          label="Annual Harvest"     value={`${gallons.toLocaleString()} gal`} />
        <Metric icon={<RotateCcw className="w-3.5 h-3.5 text-violet-400" />}
          label="Est. Payback"       value={s.payback_years >= 99 ? "N/A" : `${s.payback_years} yrs`} />
        <Metric icon={<TrendingUp className="w-3.5 h-3.5 text-amber-400" />}
          label="TX Rebate Available" value={`$${s.rebate_available.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
      </div>

      {/* Score breakdown */}
      <div className="space-y-2">
        <SectionLabel>Score Breakdown</SectionLabel>
        <BreakdownBar label="Roof Area"     sub={`${b.roof_area_m2.toLocaleString()} m²`}        value={b.roof_area_m2}          max={100_000} color="bg-sky-500" />
        <BreakdownBar label="Annual Rainfall" sub={`${s.annual_rainfall_mm} mm/yr`}               value={s.annual_rainfall_mm}    max={2500}    color="bg-blue-500" />
        <BreakdownBar label="Water Price"   sub={`$${s.water_price_per_m3}/m³`}                   value={s.water_price_per_m3}    max={10}      color="bg-violet-500" />
        <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2 flex items-center justify-between text-xs">
          <span className="text-slate-400">ESG Multiplier</span>
          <span className="font-mono text-sky-400 font-semibold">×{s.breakdown.esg_multiplier.toFixed(2)}</span>
        </div>
      </div>

      {/* Install cost estimate */}
      <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 px-3 py-2.5 space-y-1">
        <SectionLabel>Estimated Install Cost</SectionLabel>
        <p className="text-lg font-bold text-slate-200">${installCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        <p className="text-xs text-slate-500">Based on $2.50/m³ harvesting capacity (industry avg for commercial)</p>
      </div>
    </div>
  );
}

// ── Charts tab ───────────────────────────────────────────────────────────────

function ChartsTab({ b, installCost }: { b: Building; installCost: number }) {
  const s = b.score;
  return (
    <div className="p-4 space-y-6">
      {/* Monthly harvest chart */}
      <div>
        <SectionLabel icon={<BarChart3 className="w-3.5 h-3.5" />}>
          Monthly Harvest Potential (m³)
        </SectionLabel>
        <p className="text-xs text-slate-500 mb-3">Based on 30-yr Austin rainfall normals × {b.roof_area_m2.toLocaleString()} m² roof × 0.85 runoff</p>
        <MonthlyBarChart data={s.monthly_harvest_m3} />
      </div>

      {/* Monthly rainfall */}
      <div>
        <SectionLabel icon={<Droplets className="w-3.5 h-3.5 text-sky-400" />}>
          Monthly Rainfall at Site (mm)
        </SectionLabel>
        <p className="text-xs text-slate-500 mb-3">Austin long-run average precipitation by month</p>
        <MonthlyBarChart data={s.monthly_rainfall_mm} unit="mm" color="#38bdf8" />
      </div>

      {/* ROI projection */}
      <div>
        <SectionLabel icon={<LineChart className="w-3.5 h-3.5" />}>
          15-Year Financial Projection
        </SectionLabel>
        <p className="text-xs text-slate-500 mb-3">
          Cumulative savings vs. install cost of ${installCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
        <ROIChart annualValue={s.annual_value} installCost={installCost} />
        <div className="flex gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 inline-block" />Cumulative savings</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block border-dashed" />Install cost</div>
        </div>
      </div>
    </div>
  );
}

// ── ESG tab ──────────────────────────────────────────────────────────────────

function EsgTab({ b }: { b: Building }) {
  const s = b.score;
  return (
    <div className="p-4 space-y-4">
      <SectionLabel>ESG Signal Status</SectionLabel>

      <EsgCard
        icon={<Leaf className="w-4 h-4" />}
        title="Science Based Targets (SBTi)"
        active={s.has_sbti_target}
        activeDesc="This company has a validated SBTi near-term emissions target on file. ESG multiplier +15%."
        inactiveDesc="No SBTi target detected. Adding this would increase the viability score by 15%."
        source="SBTi companies-excel.xlsx"
      />
      <EsgCard
        icon={<FileText className="w-4 h-4" />}
        title="Water ESG in SEC 10-K"
        active={s.mentions_water_esg}
        activeDesc="10-K filing mentions water sustainability, stormwater, or water recycling. ESG multiplier +10%."
        inactiveDesc="No water ESG mentions found in SEC filings. Targeting buildings whose tenants do have filings improves ROI."
        source="SEC EDGAR Full-Text Search"
      />

      <div className="space-y-2">
        <SectionLabel>Texas Incentives</SectionLabel>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-emerald-400">Austin City Rebate</span>
            <span className="text-sm font-bold text-emerald-400">${s.rebate_available.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <p className="text-xs text-slate-400">$0.50–$1.00/gallon harvesting capacity, capped at $5,000/site</p>
        </div>
        <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-300">Additional TX Incentives</p>
          <p className="text-xs text-slate-500">· Sales tax exemption on harvesting equipment (TX Tax Code §151.355)</p>
          <p className="text-xs text-slate-500">· Property tax exemption for water conservation (§11.32)</p>
          <p className="text-xs text-slate-500">· SAWS (San Antonio) up to $2,000 if applicable</p>
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel>Grundfos Fit Score</SectionLabel>
        <div className="rounded-lg bg-sky-500/10 border border-sky-500/25 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-sky-400">Sales Priority</span>
            <PriorityBadge score={s.total} esg={s.has_sbti_target || s.mentions_water_esg} />
          </div>
          <p className="text-xs text-slate-400">
            {s.total >= 67
              ? "High-priority prospect. Large roof, strong rainfall, and active ESG commitments create a compelling ROI story."
              : s.total >= 33
              ? "Medium-priority. Consider targeting alongside ESG outreach to increase score multiplier."
              : "Lower priority for immediate outreach. Best approached as part of a district-level campaign."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Chart components ─────────────────────────────────────────────────────────

function MonthlyBarChart({ data, unit = "m³", color = "#22c55e" }: { data: number[]; unit?: string; color?: string }) {
  const max = Math.max(...data);
  const chartH = 110;
  const barW = 27;
  const gap = 5;
  const totalW = 12 * (barW + gap) - gap;
  const padY = 20;

  return (
    <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 p-3">
      <svg viewBox={`0 0 ${totalW} ${chartH + padY + 18}`} className="w-full">
        {data.map((val, i) => {
          const barH = max > 0 ? (val / max) * chartH : 0;
          const x = i * (barW + gap);
          const y = padY + chartH - barH;
          const isWet = i === data.indexOf(Math.max(...data));
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={barW} height={barH}
                rx={3}
                fill={isWet ? color : color + "99"}
              />
              {barH > 16 && (
                <text x={x + barW / 2} y={y + 12} textAnchor="middle" fill="white" fontSize={8} fontFamily="monospace">
                  {val > 100 ? Math.round(val) : val.toFixed(1)}
                </text>
              )}
              <text x={x + barW / 2} y={padY + chartH + 13} textAnchor="middle" fill="#64748b" fontSize={8}>
                {MONTHS[i].slice(0, 1)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-slate-500 text-right -mt-1">Peak: {Math.max(...data).toFixed(1)} {unit}</p>
    </div>
  );
}

function ROIChart({ annualValue, installCost }: { annualValue: number; installCost: number }) {
  const years = 15;
  const W = 400, H = 130;
  const padL = 48, padR = 10, padT = 10, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxY = Math.max(installCost * 1.4, annualValue * years * 0.4);
  const toX = (yr: number) => padL + (yr / years) * plotW;
  const toY = (val: number) => padT + plotH - (val / maxY) * plotH;

  // Cumulative savings line points
  const points = Array.from({ length: years + 1 }, (_, i) => ({
    x: toX(i),
    y: toY(annualValue * i),
  }));
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Payback crossover
  const paybackYr = annualValue > 0 ? installCost / annualValue : 999;
  const crossX = paybackYr <= years ? toX(paybackYr) : null;

  // Y-axis ticks
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (maxY * i) / tickCount);

  return (
    <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={toY(v)} y2={toY(v)} stroke="#1e293b" strokeWidth={1} />
            <text x={padL - 4} y={toY(v) + 3} textAnchor="end" fill="#475569" fontSize={8}>
              {v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`}
            </text>
          </g>
        ))}
        {/* X-axis ticks */}
        {[0, 3, 6, 9, 12, 15].map((yr) => (
          <text key={yr} x={toX(yr)} y={H - 6} textAnchor="middle" fill="#475569" fontSize={8}>
            {yr}yr
          </text>
        ))}

        {/* Install cost line (dashed red) */}
        <line
          x1={padL} y1={toY(installCost)} x2={W - padR} y2={toY(installCost)}
          stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3"
        />

        {/* Cumulative savings — fill under line after payback */}
        {crossX && (
          <polygon
            points={`${crossX},${toY(0)} ${points.filter(p => p.x >= crossX).map(p => `${p.x},${p.y}`).join(" ")} ${W - padR},${toY(0)}`}
            fill="#22c55e22"
          />
        )}

        {/* Savings line */}
        <polyline points={polyline} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round" />

        {/* Payback marker */}
        {crossX && (
          <g>
            <line x1={crossX} y1={padT} x2={crossX} y2={H - padB} stroke="#38bdf8" strokeWidth={1} strokeDasharray="3,2" />
            <text x={crossX + 3} y={padT + 10} fill="#38bdf8" fontSize={8}>
              Payback ~{paybackYr.toFixed(1)}yr
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function Metric({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">{icon}<span className="text-xs">{label}</span></div>
      <p className={`font-semibold text-sm ${highlight ? "text-emerald-400" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}

function BreakdownBar({ label, sub, value, max, color }: { label: string; sub: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500 font-mono">{sub}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
      {icon}{children}
    </div>
  );
}

function EsgCard({ icon, title, active, activeDesc, inactiveDesc, source }: {
  icon: React.ReactNode; title: string; active: boolean;
  activeDesc: string; inactiveDesc: string; source: string;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${active ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-800/40 border-slate-700/40"}`}>
      <div className="flex items-center gap-2">
        <span className={active ? "text-emerald-400" : "text-slate-600"}>{icon}</span>
        <span className="text-sm font-semibold text-slate-200">{title}</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-medium ${active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" : "bg-slate-700/50 text-slate-500 border-slate-700"}`}>
          {active ? "Active" : "Not detected"}
        </span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{active ? activeDesc : inactiveDesc}</p>
      <p className="text-[10px] text-slate-600">Source: {source}</p>
    </div>
  );
}

function PriorityBadge({ score, esg }: { score: number; esg: boolean }) {
  const high = score >= 67 && esg;
  const med = score >= 33;
  const label = high ? "High Priority" : med ? "Medium Priority" : "Lower Priority";
  const cls = high ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
    : med ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
    : "bg-slate-700/50 text-slate-500 border-slate-700";
  return <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>{label}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    office:      "bg-sky-500/15 text-sky-400 border-sky-500/30",
    retail:      "bg-violet-500/15 text-violet-400 border-violet-500/30",
    industrial:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
    "mixed-use": "bg-pink-500/15 text-pink-400 border-pink-500/30",
    warehouse:   "bg-slate-500/15 text-slate-400 border-slate-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium capitalize ${colors[type] ?? colors["office"]}`}>
      {type}
    </span>
  );
}
