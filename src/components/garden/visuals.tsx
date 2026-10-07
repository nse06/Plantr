"use client";

import type { BedLayout, ContainerLayout, PlannedPlant } from "@/lib/garden/types";
import { PLANT_ABBR, PLANT_COLORS, PLANTS_BY_ID } from "@/lib/garden/plants";
import { addDays, diffDays, fmtShort, parseISO } from "@/lib/garden/dates";
import { cx } from "@/components/ui";

export function plantColor(id: string | null): string {
  return (id && PLANT_COLORS[id]) || "#9ca3af";
}

/** Readable text on a colored tile. */
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? "#1e2a1f" : "#ffffff";
}

export function PlantBadge({ plantId, size = "md" }: { plantId: string; size?: "sm" | "md" | "lg" }) {
  const p = PLANTS_BY_ID[plantId];
  const color = plantColor(plantId);
  const dims = { sm: "h-8 w-8 text-base", md: "h-11 w-11 text-xl", lg: "h-14 w-14 text-2xl" }[size];
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-black/5", dims)}
      style={{ background: `${color}22` }}
      aria-hidden
    >
      {p?.emoji ?? "🌱"}
    </span>
  );
}

const CELL = 48;
const PAD = 26;

export function BedGrid({
  layout,
  raised,
  selected,
  onSelect,
}: {
  layout: BedLayout;
  raised: boolean;
  selected: string | null;
  onSelect?: (plantId: string | null) => void;
}) {
  const W = layout.widthFt * CELL;
  const H = layout.lengthFt * CELL;
  const vbW = W + PAD * 2;
  const vbH = H + PAD * 2;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label={`${layout.name}: ${layout.widthFt} by ${layout.lengthFt} feet garden layout`}
    >
      <defs>
        <pattern id={`soil-${layout.areaId}`} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#7a5a3f" />
          <circle cx="3" cy="4" r="1" fill="#6a4c34" />
          <circle cx="9" cy="9" r="1.2" fill="#8a6a4d" />
        </pattern>
      </defs>
      {/* Dimension labels */}
      <text x={PAD + W / 2} y={PAD - 9} textAnchor="middle" fontSize="12" fill="#5d6a5c" fontWeight="600">
        {layout.widthFt} ft
      </text>
      <text
        x={PAD - 9}
        y={PAD + H / 2}
        textAnchor="middle"
        fontSize="12"
        fill="#5d6a5c"
        fontWeight="600"
        transform={`rotate(-90 ${PAD - 9} ${PAD + H / 2})`}
      >
        {layout.lengthFt} ft
      </text>
      {/* Bed frame and soil */}
      <rect
        x={PAD - (raised ? 6 : 2)}
        y={PAD - (raised ? 6 : 2)}
        width={W + (raised ? 12 : 4)}
        height={H + (raised ? 12 : 4)}
        rx={raised ? 8 : 4}
        fill={raised ? "#b98a5a" : "#8b6b4c"}
      />
      <rect x={PAD} y={PAD} width={W} height={H} rx={4} fill={`url(#soil-${layout.areaId})`} />
      {/* Square-foot grid lines */}
      {Array.from({ length: layout.widthFt - 1 }, (_, i) => (
        <line key={`v${i}`} x1={PAD + (i + 1) * CELL} y1={PAD} x2={PAD + (i + 1) * CELL} y2={PAD + H} stroke="#5c4330" strokeWidth="1" opacity="0.6" />
      ))}
      {Array.from({ length: layout.lengthFt - 1 }, (_, i) => (
        <line key={`h${i}`} x1={PAD} y1={PAD + (i + 1) * CELL} x2={PAD + W} y2={PAD + (i + 1) * CELL} stroke="#5c4330" strokeWidth="1" opacity="0.6" />
      ))}
      {layout.cells.map((cell, i) => {
        const x = PAD + cell.x * CELL;
        const y = PAD + cell.y * CELL;
        const w = cell.w * CELL;
        const h = cell.h * CELL;
        if (!cell.plantId) {
          return (
            <g key={i}>
              <rect x={x + 2} y={y + 6} width={w - 4} height={h - 12} rx={6} fill="#d9cfb8" />
              <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fill="#7c6f57" fontWeight="600">
                path
              </text>
            </g>
          );
        }
        const color = plantColor(cell.plantId);
        const dim = selected && selected !== cell.plantId;
        const label = PLANT_ABBR[cell.plantId] ?? "?";
        const big = cell.w > 1 || cell.h > 1 || cell.count === 1;
        return (
          <g
            key={i}
            onClick={() => onSelect?.(selected === cell.plantId ? null : cell.plantId)}
            style={{ cursor: onSelect ? "pointer" : undefined, opacity: dim ? 0.35 : 1, transition: "opacity .2s" }}
          >
            <title>{`${PLANTS_BY_ID[cell.plantId]?.name ?? cell.plantId}${cell.count > 1 ? ` × ${cell.count}` : ""}`}</title>
            <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={8} fill={`${color}33`} stroke={selected === cell.plantId ? "#f2b33d" : "transparent"} strokeWidth="3" />
            {big ? (
              <>
                <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 2 - 7} fill={color} />
                <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fontSize={Math.min(w, h) > CELL ? 18 : 14} fontWeight="700" fill={textOn(color)}>
                  {label}
                </text>
              </>
            ) : (
              <Dots x={x} y={y} size={CELL} count={cell.count} color={color} label={label} />
            )}
          </g>
        );
      })}
      {/* Compass */}
      <g transform={`translate(${vbW - 16}, ${12})`}>
        <path d="M0 -2 L5 9 L0 6 L-5 9 Z" fill="#2f6b3b" />
        <text x="0" y="21" textAnchor="middle" fontSize="10" fontWeight="700" fill="#2f6b3b">
          N
        </text>
      </g>
    </svg>
  );
}

function Dots({ x, y, size, count, color, label }: { x: number; y: number; size: number; count: number; color: string; label: string }) {
  const n = Math.ceil(Math.sqrt(count));
  const step = (size - 14) / n;
  const r = Math.max(2, Math.min(8, step / 2 - 1.5));
  const dots = [];
  for (let i = 0; i < count; i++) {
    const cx = x + 7 + step * (i % n) + step / 2;
    const cy = y + 7 + step * Math.floor(i / n) + step / 2;
    dots.push(<circle key={i} cx={cx} cy={cy} r={r} fill={color} />);
  }
  return (
    <>
      {dots}
      <text
        x={x + size / 2}
        y={y + size / 2 + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="800"
        fill="#1e2a1f"
        stroke="#ffffff"
        strokeWidth="3"
        paintOrder="stroke"
      >
        {label}
      </text>
    </>
  );
}

export function ContainerGrid({
  layout,
  selected,
  onSelect,
}: {
  layout: ContainerLayout;
  selected: string | null;
  onSelect?: (plantId: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {layout.pots.map((pot, i) => {
        const color = plantColor(pot.plantId);
        const p = pot.plantId ? PLANTS_BY_ID[pot.plantId] : null;
        const dim = selected && pot.plantId !== selected;
        return (
          <button
            key={i}
            type="button"
            disabled={!pot.plantId}
            onClick={() => pot.plantId && onSelect?.(selected === pot.plantId ? null : pot.plantId)}
            className={cx("flex flex-col items-center gap-1 rounded-2xl p-1 text-center transition-opacity", dim && "opacity-40")}
          >
            <span
              className="relative flex aspect-square w-full max-w-24 items-center justify-center rounded-full border-[6px] text-3xl"
              style={{
                borderColor: "#c8643b",
                background: p ? `${color}30` : "#efe7d6",
                boxShadow: selected === pot.plantId ? "0 0 0 3px #f2b33d" : undefined,
              }}
            >
              {p ? p.emoji : <span className="text-sm text-faint">empty</span>}
              {p && pot.count > 1 && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-ink px-1.5 text-[11px] font-bold text-white">×{pot.count}</span>
              )}
            </span>
            <span className="text-xs font-semibold leading-tight text-ink">{p ? p.name : "Spare pot"}</span>
            <span className="text-[11px] text-faint">{pot.gallons} gal</span>
          </button>
        );
      })}
    </div>
  );
}

/** Indoor gardens: pots in a row along the windowsill, with the window (and any grow light) above. */
export function WindowsillView({
  layout,
  selected,
  onSelect,
  growLight,
}: {
  layout: ContainerLayout;
  selected: string | null;
  onSelect?: (plantId: string | null) => void;
  growLight?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-line">
      <div className="relative h-20 sm:h-24" style={{ background: "linear-gradient(#d7e9f7, #eef5fb 70%, #fff)" }} aria-hidden>
        <div className="absolute inset-x-6 bottom-0 top-0 grid grid-cols-2 gap-1.5 border-x-[6px] border-t-[6px] border-paper sm:inset-x-12">
          <div style={{ background: "rgba(255,255,255,0.35)" }} />
          <div style={{ background: "rgba(255,255,255,0.35)" }} />
        </div>
        {growLight && (
          <div
            className="absolute inset-x-10 top-2 h-2.5 rounded-full bg-sun-300 sm:inset-x-16"
            style={{ boxShadow: "0 6px 24px 6px rgba(242,179,61,0.45)" }}
          />
        )}
      </div>
      <div className="no-scrollbar flex items-end gap-2 overflow-x-auto bg-paper px-3 pt-2 sm:gap-3 sm:px-6">
        {layout.pots.map((pot, i) => {
          const p = pot.plantId ? PLANTS_BY_ID[pot.plantId] : null;
          const dim = selected && pot.plantId !== selected;
          const inches = pot.potIn ?? 6;
          const width = 46 + inches * 4;
          return (
            <button
              key={i}
              type="button"
              disabled={!pot.plantId}
              onClick={() => pot.plantId && onSelect?.(selected === pot.plantId ? null : pot.plantId)}
              className={cx("flex shrink-0 flex-col items-center text-center transition-opacity", dim && "opacity-40")}
              style={{ width }}
            >
              <span className="relative text-3xl leading-none" style={{ filter: selected === pot.plantId ? "drop-shadow(0 0 6px #f2b33d)" : undefined }}>
                {p ? p.emoji : <span className="text-xs text-faint">empty</span>}
                {p && pot.count > 1 && (
                  <span className="absolute -right-3 -top-1 rounded-full bg-ink px-1.5 text-[11px] font-bold text-white">×{pot.count}</span>
                )}
              </span>
              <span
                className="mt-1 flex w-full items-center justify-center text-[11px] font-bold text-white"
                style={{
                  height: 18 + inches * 2,
                  background: p ? "#c8643b" : "#d9b8a6",
                  clipPath: "polygon(4% 0, 96% 0, 84% 100%, 16% 100%)",
                }}
              >
                {inches}&Prime;
              </span>
              <span className="mt-1 w-full truncate pb-1 text-xs font-semibold leading-tight text-ink">{p ? p.name : "Spare pot"}</span>
            </button>
          );
        })}
      </div>
      <div className="h-3" style={{ background: "#c9a27a" }} aria-hidden />
    </div>
  );
}

/** Gantt-style season timeline: seed starting, growing and harvest windows per plant. */
export function SeasonTimeline({ plants, today }: { plants: PlannedPlant[]; today: string }) {
  if (plants.length === 0) return null;
  const starts = plants.map((p) => p.schedule.startIndoors ?? p.schedule.plantOut);
  const ends = plants.map((p) => p.schedule.harvestEnd);
  const first = starts.reduce((a, b) => (a < b ? a : b));
  const last = ends.reduce((a, b) => (a > b ? a : b));
  const startMonth = `${first.slice(0, 7)}-01`;
  const endDate = parseISO(last);
  const endMonth = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const total = diffDays(startMonth, endMonth);
  const pct = (d: string) => `${Math.min(100, Math.max(0, (diffDays(startMonth, d) / total) * 100))}%`;
  const width = (a: string, b: string) => `${Math.max(0.8, (diffDays(a, b) / total) * 100)}%`;

  const months: { label: string; left: string }[] = [];
  for (let d = startMonth; d < endMonth; ) {
    const dt = parseISO(d);
    months.push({ label: dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), left: pct(d) });
    d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  }
  const showToday = today >= startMonth && today <= endMonth;
  const sorted = [...plants].sort((a, b) =>
    (a.schedule.startIndoors ?? a.schedule.plantOut).localeCompare(b.schedule.startIndoors ?? b.schedule.plantOut),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="grid grid-cols-[96px_1fr] sm:grid-cols-[150px_1fr]">
        <div className="border-b border-line bg-cream/60" />
        <div className="relative h-8 border-b border-line bg-cream/60">
          {months.map((m) => (
            <span key={m.left} className="absolute top-2 -translate-x-0 pl-1 text-[11px] font-semibold text-muted" style={{ left: m.left }}>
              {m.label}
            </span>
          ))}
        </div>
        {sorted.map((p) => {
          const s = p.schedule;
          return (
            <div key={p.plantId} className="contents">
              <div className="flex items-center gap-1.5 border-b border-line/70 px-2 py-2 text-[13px] font-medium sm:px-3">
                <span aria-hidden>{p.emoji}</span>
                <span className="truncate">{p.name}</span>
              </div>
              <div className="relative border-b border-line/70">
                {months.map((m) => (
                  <span key={m.left} className="absolute inset-y-0 w-px bg-line/70" style={{ left: m.left }} />
                ))}
                {showToday && <span className="absolute inset-y-0 z-10 w-0.5 bg-clay-500/80" style={{ left: pct(today) }} />}
                {s.startIndoors && (
                  <span
                    title={`Start indoors ${fmtShort(s.startIndoors)}`}
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-sky-500/25 ring-1 ring-sky-500/40"
                    style={{ left: pct(s.startIndoors), width: width(s.startIndoors, s.plantOut) }}
                  />
                )}
                <span
                  title={`In the ground ${fmtShort(s.plantOut)}`}
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-leaf-300"
                  style={{ left: pct(s.plantOut), width: width(s.plantOut, s.harvestStart) }}
                />
                <span
                  title={`Harvest ${fmtShort(s.harvestStart)}–${fmtShort(s.harvestEnd)}`}
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-sun-400"
                  style={{ left: pct(s.harvestStart), width: width(s.harvestStart, s.harvestEnd) }}
                />
                {s.successions.map((d) => (
                  <span
                    key={d}
                    title={`Sow again ${fmtShort(d)}`}
                    className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded bg-leaf-600"
                    style={{ left: pct(d) }}
                  />
                ))}
                <span className="block h-9" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-cream/60 px-3 py-2 text-[12px] text-muted">
        <Legend className="bg-sky-500/25 ring-1 ring-sky-500/40" label="Start indoors" />
        <Legend className="bg-leaf-300" label="Growing" />
        <Legend className="bg-sun-400" label="Harvest" />
        <Legend className="h-3 w-1 rounded bg-leaf-600" label="Sow again" />
        {showToday && <Legend className="h-3 w-0.5 bg-clay-500" label={`Today (${fmtShort(today)})`} />}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("inline-block h-2.5 w-5 rounded-full", className)} />
      {label}
    </span>
  );
}

/** Where a plant is in its life right now. */
export function plantStage(p: PlannedPlant, today: string): { label: string; tone: "neutral" | "leaf" | "sun" | "clay" } {
  const s = p.schedule;
  if (s.startIndoors && today >= s.startIndoors && today < s.plantOut) return { label: "Seedlings indoors", tone: "neutral" };
  if (today < (s.startIndoors ?? s.plantOut)) {
    const days = diffDays(today, s.startIndoors ?? s.plantOut);
    return { label: days <= 7 ? "Starting soon" : `Starts in ${Math.round(days / 7)} wk`, tone: "neutral" };
  }
  if (today < s.harvestStart) return { label: "Growing", tone: "leaf" };
  if (today <= s.harvestEnd) return { label: "Harvest time", tone: "sun" };
  if (today <= addDays(s.harvestEnd, 21)) return { label: "Wrapping up", tone: "clay" };
  return { label: "Done for the season", tone: "neutral" };
}
