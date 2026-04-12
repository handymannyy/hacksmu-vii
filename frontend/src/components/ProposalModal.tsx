import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Zap, Loader2 } from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CVBuilding } from "../types";
import { scoreColor } from "../types";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

interface Props {
  building: CVBuilding;
  onClose: () => void;
}

function buildPrompt(b: CVBuilding): string {
  const gallons = Math.round(b.harvestable_m3 * 264.172);
  const installCost = (b.harvestable_m3 * 2.5).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const payback = b.payback_years >= 99 ? "N/A" : `${b.payback_years} years`;

  return `Data: ID:${b.osm_id}|Area:${b.sqft}ft²|Score:${Math.round(b.score)}|Yield:${gallons}gal|Savings:$${b.annual_value}|Cost:$${installCost}|Payback:${payback}|Rebate:$${b.rebate_available}|Tower:${b.cooling_tower}|Conf:${b.confidence}%

Write a brief Grundfos rainwater harvesting proposal. Be ruthlessly concise. Use Markdown.

## Executive Summary
2 sentences max.

## Opportunity
3 bullet points max. Numbers only, no fluff.

## Grundfos Solution
1-2 specific product lines with one-line justification each.

## Financials
4 bullet points max. Format: **Label:** Value.

## Impact
1 sentence on water saved. 1 sentence on CO2.

## Next Steps
3 numbered items, one line each.`;
}

// ── Section parser ────────────────────────────────────────────────────────────

interface Section { title: string; lines: string[] }

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (/^##+ /.test(line)) {
      if (current) sections.push(current);
      current = { title: line.replace(/^##+ /, "").trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*/.test(p)
      ? <strong key={i} className="text-slate-100 font-semibold">{p.replace(/\*\*/g, "")}</strong>
      : <span key={i}>{p}</span>
  );
}

function SectionCard({ title, lines, streaming }: Section & { streaming: boolean }) {
  const content = lines.filter(l => l.trim() !== "");

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
      {/* Section label */}
      <div className="px-4 py-2 border-b border-slate-700/50 bg-slate-800/50">
        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">{title}</span>
      </div>

      {/* Section body */}
      <div className="px-4 py-3 space-y-1.5">
        {content.map((line, i) => {
          const isLast = i === content.length - 1;

          // Bullet point
          if (/^[-*•] /.test(line)) {
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-cyan-400 shrink-0" />
                <p className="text-sm text-slate-300 leading-relaxed">
                  {renderInline(line.replace(/^[-*•] /, ""))}
                  {streaming && isLast && <span className="inline-block w-1 h-3.5 bg-cyan-400 animate-pulse ml-0.5 rounded-sm align-middle" />}
                </p>
              </div>
            );
          }

          // Numbered list
          if (/^\d+\./.test(line)) {
            const num = line.match(/^(\d+)\./)?.[1];
            return (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-0.5 text-xs font-bold text-cyan-500 w-4 shrink-0">{num}.</span>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {renderInline(line.replace(/^\d+\.\s*/, ""))}
                  {streaming && isLast && <span className="inline-block w-1 h-3.5 bg-cyan-400 animate-pulse ml-0.5 rounded-sm align-middle" />}
                </p>
              </div>
            );
          }

          // Table row — skip separator lines
          if (/^\|/.test(line)) {
            if (/^[\|\s\-:]+$/.test(line)) return null;
            const cells = line.split("|").map(c => c.trim()).filter(Boolean);
            const isHeader = content.findIndex(l => /^\|/.test(l)) === i;
            return (
              <div key={i} className={`flex gap-4 text-sm py-1 ${i > 0 ? "border-t border-slate-700/40" : ""}`}>
                <span className={`w-1/2 ${isHeader ? "text-slate-400 text-xs uppercase tracking-wide" : "text-slate-400"}`}>
                  {cells[0]}
                </span>
                <span className={`w-1/2 font-medium ${isHeader ? "text-slate-400 text-xs uppercase tracking-wide" : "text-slate-100"}`}>
                  {cells[1]}
                </span>
              </div>
            );
          }

          // Regular paragraph
          return (
            <p key={i} className="text-sm text-slate-300 leading-relaxed">
              {renderInline(line)}
              {streaming && isLast && <span className="inline-block w-1 h-3.5 bg-cyan-400 animate-pulse ml-0.5 rounded-sm align-middle" />}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function ProposalModal({ building: b, onClose }: Props) {
  const [proposal, setProposal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!GEMINI_KEY) {
      setError("VITE_GEMINI_API_KEY is not set in your .env file.");
      setLoading(false);
      return;
    }

    const gen = new GoogleGenerativeAI(GEMINI_KEY);
    const model = gen.getGenerativeModel({ model: "gemini-2.5-flash" });

    let cancelled = false;
    setLoading(true);
    setProposal("");
    setError(null);

    (async () => {
      try {
        const result = await model.generateContentStream(buildPrompt(b));
        for await (const chunk of result.stream) {
          if (cancelled) break;
          setProposal((prev) => prev + chunk.text());
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [b.osm_id]);

  const handleCopy = () => {
    navigator.clipboard.writeText(proposal);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sections = parseSections(proposal);

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: "rgba(2, 8, 23, 0.97)",
            border: "1px solid rgba(6, 182, 212, 0.2)",
            backdropFilter: "blur(20px)",
          }}
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: scoreColor(b.score) + "22", border: `1px solid ${scoreColor(b.score)}44` }}
              >
                <Zap className="w-3.5 h-3.5" style={{ color: scoreColor(b.score) }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Ask Jensen</p>
                <p className="text-xs text-slate-500 font-mono">OSM {b.osm_id} · {b.sqft.toLocaleString()} ft²</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {proposal && !loading && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-thin">
            {loading && sections.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-12 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                Generating proposal with Gemini 2.5 Flash...
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {sections.map((section, i) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <SectionCard
                  {...section}
                  streaming={loading && i === sections.length - 1}
                />
              </motion.div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-700/60 shrink-0 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">Generated by Gemini 2.5 Flash · Project Jensen</p>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
