import { X, Droplets, Thermometer, AlertTriangle, TrendingUp, DollarSign, Leaf } from "lucide-react";
import type { ClimateDetail } from "../types";
import { MONTHS } from "../types";

interface Props {
  detail: ClimateDetail;
  onClose: () => void;
}

export default function ClimateInfoPanel({ detail, onClose }: Props) {
  const { precipitation, forecast, financial, resilience } = detail;

  const resColor =
    resilience.opportunity_level === "High" ? "#22c55e"
    : resilience.opportunity_level === "Medium" ? "#f59e0b"
    : "#ef4444";

  const stressColor = (stress: number) =>
    stress > 70 ? "#ef4444" : stress > 40 ? "#f59e0b" : "#22c55e";

  return (
    <aside className="glass flex flex-col w-[400px] shrink-0 overflow-hidden z-10 h-full overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/60 shrink-0">
        <div>
          <h2 className="font-semibold text-slate-100 text-sm">Climate Detail</h2>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            {detail.lat.toFixed(2)}°, {detail.lon.toFixed(2)}°
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        {/* Resilience score */}
        <div
          className="rounded-xl px-4 py-3 border flex items-center justify-between"
          style={{ background: resColor + "15", borderColor: resColor + "40" }}
        >
          <div>
            <p className="text-xs text-slate-400">Harvest Opportunity</p>
            <p className="font-bold text-lg" style={{ color: resColor }}>
              {resilience.opportunity_level}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black font-mono" style={{ color: resColor }}>
              {Math.round(resilience.resilience_score)}
            </p>
            <p className="text-[10px] text-slate-500">/100</p>
          </div>
        </div>

        {/* Precipitation */}
        <Section icon={<Droplets className="w-3.5 h-3.5 text-sky-400" />} title="Precipitation">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Annual Average" value={`${precipitation.annual_avg_mm.toLocaleString()} mm`} />
            <Metric
              label="vs. Global Mean"
              value={`${precipitation.annual_avg_mm >= 1000 ? "+" : ""}${Math.round(precipitation.annual_avg_mm - 1000)} mm`}
              color={precipitation.annual_avg_mm >= 1000 ? "#22c55e" : "#f59e0b"}
            />
          </div>
          <MonthlyBar monthly={precipitation.monthly_avg_mm} />
          <p className="text-[10px] text-slate-600 mt-1">Source: {precipitation.source}</p>
        </Section>

        {/* 14-day forecast */}
        {forecast.dates.length > 0 && (
          <Section icon={<Thermometer className="w-3.5 h-3.5 text-violet-400" />} title="14-Day Forecast">
            <div className="overflow-x-auto">
              <div className="flex gap-1 min-w-max pb-1">
                {forecast.dates.slice(0, 14).map((d, i) => {
                  const mm = forecast.precipitation_mm[i] ?? 0;
                  const prob = forecast.precipitation_probability[i] ?? 0;
                  const barH = Math.min(40, mm * 3);
                  return (
                    <div key={d} className="flex flex-col items-center gap-0.5 w-8">
                      <div className="flex items-end h-10 w-full justify-center">
                        <div
                          className="w-4 rounded-t"
                          style={{ height: `${barH}px`, background: `rgba(56,189,248,${0.3 + prob / 200})` }}
                        />
                      </div>
                      <p className="text-[9px] text-slate-500">{d.slice(5)}</p>
                      <p className="text-[9px] text-sky-400 font-mono">{mm.toFixed(0)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] text-slate-600">mm/day · Source: {forecast.source}</p>
          </Section>
        )}

        {/* Water stress */}
        <Section icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />} title="Water Stress">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Climate Exposure" value={`${Math.round(resilience.climate_exposure)}/100`}
              color={stressColor(resilience.climate_exposure)} />
            <Metric label="Precip Opportunity" value={`${Math.round(resilience.precip_opportunity)}/100`}
              color="#22c55e" />
          </div>
        </Section>

        {/* Financial */}
        <Section icon={<DollarSign className="w-3.5 h-3.5 text-emerald-400" />} title="Financial">
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Water Price"
              value={`$${financial.water_cost.water_cost_per_m3.toFixed(2)}/m³`}
              highlight
            />
            <Metric
              label="Financial Score"
              value={`${financial.financial_viability_coefficient.toFixed(1)}/10`}
              color={financial.financial_viability_coefficient >= 6 ? "#22c55e" : financial.financial_viability_coefficient >= 3 ? "#f59e0b" : "#ef4444"}
            />
            {financial.annual_water_savings_usd != null && (
              <Metric label="Est. Annual Savings"
                value={`$${financial.annual_water_savings_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                highlight />
            )}
            <Metric
              label="Stormwater Fee"
              value={`$${financial.stormwater_fee.fee_per_sqft_impervious_usd.toFixed(3)}/ft²`}
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">Source: {financial.water_cost.source}</p>
        </Section>

        {/* Tax incentives */}
        {financial.incentives.length > 0 && (
          <Section icon={<Leaf className="w-3.5 h-3.5 text-green-400" />} title="Tax Incentives Available">
            <div className="space-y-2">
              {financial.incentives.map((inc, i) => (
                <div key={i} className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-400">{inc.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{inc.value}</p>
                  {inc.citation && (
                    <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{inc.citation}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ESG opportunity */}
        <Section icon={<TrendingUp className="w-3.5 h-3.5 text-cyan-400" />} title="ESG Opportunity">
          <p className="text-xs text-slate-400 leading-relaxed">
            Annual precipitation of <span className="text-slate-200 font-mono">{precipitation.annual_avg_mm} mm</span> puts
            this region in the{" "}
            <span style={{ color: resColor }} className="font-semibold">
              {resilience.opportunity_level.toLowerCase()} opportunity
            </span>{" "}
            tier. Buildings here benefit{" "}
            {resilience.opportunity_level === "High"
              ? "strongly from rainwater harvesting systems — high water prices and stress amplify ROI."
              : resilience.opportunity_level === "Medium"
              ? "moderately from harvesting — local incentives and water pricing drive final viability."
              : "less from harvesting — low water prices or precipitation limit the business case."}
          </p>
        </Section>
      </div>
    </aside>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Section({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function Metric({ label, value, color, highlight }: {
  label: string; value: string; color?: string; highlight?: boolean;
}) {
  return (
    <div className="bg-slate-800/60 rounded-lg px-2.5 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p
        className="text-sm font-semibold font-mono mt-0.5"
        style={{ color: color ?? (highlight ? "#34d399" : "#e2e8f0") }}
      >
        {value}
      </p>
    </div>
  );
}

function MonthlyBar({ monthly }: { monthly: number[] }) {
  const max = Math.max(...monthly, 1);
  return (
    <div className="flex gap-0.5 items-end h-10 mt-1">
      {monthly.map((mm, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className="w-full rounded-t"
            style={{ height: `${(mm / max) * 32}px`, background: "rgba(56,189,248,0.55)" }}
            title={`${MONTHS[i]}: ${mm}mm`}
          />
          <p className="text-[8px] text-slate-600">{MONTHS[i][0]}</p>
        </div>
      ))}
    </div>
  );
}
