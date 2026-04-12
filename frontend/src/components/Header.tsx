import { Droplets, Github } from "lucide-react";
import type { Stats } from "../types";

interface Props {
  stats: Stats | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  locationLabel: string;
}

export default function Header({ stats, sidebarOpen, onToggleSidebar, locationLabel }: Props) {
  return (
    <header className="glass z-20 flex items-center gap-3 px-4 h-14 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
          <Droplets className="w-4 h-4 text-sky-400" />
        </div>
        <span className="font-bold text-slate-100 tracking-tight">
          Project <span className="text-sky-400">Jensen</span>
        </span>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-slate-700" />

      {/* City pill */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-sm">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-slate-300">{locationLabel}</span>
      </div>

      {/* Quick stats */}
      {stats && (
        <div className="hidden md:flex items-center gap-4 ml-4 text-xs text-slate-400">
          <Stat label="Buildings" value={stats.total_buildings} />
          <Stat label="Avg Score" value={`${stats.avg_score}`} accent />
          <Stat
            label="Total Annual Value"
            value={`$${(stats.total_annual_value / 1_000_000).toFixed(1)}M`}
          />
          <div className="flex items-center gap-2">
            <Pill color="emerald" count={stats.high_viability_count} label="High" />
            <Pill color="amber"   count={stats.medium_viability_count} label="Med" />
            <Pill color="red"     count={stats.low_viability_count} label="Low" />
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 transition-colors"
        >
          {sidebarOpen ? "Hide" : "Filters"}
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
        >
          <Github className="w-4 h-4 text-slate-400" />
        </a>
      </div>
    </header>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={accent ? "text-sky-400 font-semibold" : "text-slate-200 font-medium"}>
        {value}
      </span>
      <span className="text-slate-500">{label}</span>
    </div>
  );
}

function Pill({ color, count, label }: { color: "emerald" | "amber" | "red"; count: number; label: string }) {
  const cls = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    amber:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
    red:     "bg-red-500/10 text-red-400 border-red-500/30",
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${cls}`}>
      {count} {label}
    </span>
  );
}
