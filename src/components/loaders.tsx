"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

// Plant-themed loading animations: a potted seedling that grows, blooms and gets a visit from
// a bee, and little hopping leaves for "thinking". Pure SVG + CSS, and still for anyone who has
// asked their device for reduced motion.

/** 0 seed and water · 1 sprout · 2 stem · 3 first leaf · 4 second leaf · 5 bud · 6 bloom · 7 a bee visits */
export const LAST_STAGE = 7;

const POP = "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease";

function pop(on: boolean, originX: number, originY: number, rotate = 0): React.CSSProperties {
  return {
    transformOrigin: `${originX}px ${originY}px`,
    transform: on ? "scale(1) rotate(0deg)" : `scale(0) rotate(${rotate}deg)`,
    opacity: on ? 1 : 0,
    transition: POP,
  };
}

/** Center-origin styles for small animated parts (eyes blinking, wings flapping, sparkles). */
const own = (origin = "center"): React.CSSProperties => ({ transformBox: "fill-box", transformOrigin: origin });

export function PlantScene({
  stage,
  size = 160,
  indoor = false,
  className,
}: {
  stage: number;
  size?: number;
  indoor?: boolean;
  className?: string;
}) {
  const on = (n: number) => stage >= n;
  const stemShown = [0, 18, 50, 78, 100][Math.min(stage, 4)];
  return (
    <svg
      viewBox="0 0 160 170"
      width={size}
      height={(size * 170) / 160}
      className={cx("motion-calm overflow-visible", className)}
      aria-hidden
    >
      {indoor ? (
        <g>
          <rect x="22" y="6" width="116" height="100" rx="6" fill="#e3f0fa" stroke="#ffffff" strokeWidth="6" />
          <circle cx="118" cy="26" r="9" fill="#f7cf72" opacity="0.85" />
          <path d="M80 6 V106 M22 56 H138" stroke="#ffffff" strokeWidth="4" />
          <rect x="12" y="150" width="136" height="8" rx="2" fill="#c9a27a" />
        </g>
      ) : (
        <ellipse cx="80" cy="156" rx="42" ry="6" fill="#7a5a3f" opacity="0.18" />
      )}

      {/* Water drops while the seed sprouts */}
      {!on(3) &&
        [66, 80, 94].map((x, i) => (
          <path
            key={x}
            d={`M${x} 38 c2.6 4 2.6 6.4 0 7.6 c-2.6 -1.2 -2.6 -3.6 0 -7.6 z`}
            fill="#7fb6e0"
            className="animate-drop"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}

      {/* The plant: sways once it has leaves */}
      <g className={on(3) ? "animate-sway" : undefined} style={{ transformOrigin: "80px 100px" }}>
        <path
          d="M80 100 C80 86 75 74 79 62 S81 48 80 38"
          pathLength={100}
          fill="none"
          stroke="#3f8a3d"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray="100"
          style={{ strokeDashoffset: 100 - stemShown, transition: "stroke-dashoffset 0.7s ease-out" }}
        />
        {/* Seed leaves */}
        <g style={pop(on(1), 80, 90)}>
          <ellipse cx="73.5" cy="87.5" rx="6.5" ry="3.6" fill="#67a75a" transform="rotate(-25 73.5 87.5)" />
          <ellipse cx="86.5" cy="87.5" rx="6.5" ry="3.6" fill="#67a75a" transform="rotate(25 86.5 87.5)" />
        </g>
        {/* True leaves */}
        <g style={pop(on(3), 79, 70, -30)}>
          <path d="M79 70 C66 61 55 65 51 74 C61 79 72 78 79 70 Z" fill="#468a3d" />
          <path d="M78 71 C70 71 62 72 55 73.5" fill="none" stroke="#8cc152" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <g style={pop(on(4), 81, 56, 30)}>
          <path d="M81 56 C94 47 105 51 109 60 C99 65 88 64 81 56 Z" fill="#5aa152" />
          <path d="M82 57 C90 57 98 58 105 59.5" fill="none" stroke="#a5d17a" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        {/* Bud, then the flower (with its own little face) */}
        <g style={pop(on(5) && !on(6), 80, 42)}>
          <ellipse cx="80" cy="34" rx="5.5" ry="7.5" fill="#8cc152" />
          <path d="M76.5 29 Q80 23 83.5 29" fill="#f4a6c1" />
        </g>
        <g style={pop(on(6), 80, 34, -60)}>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse key={a} cx="80" cy="22.5" rx="6.2" ry="9.5" fill="#f7cf72" transform={`rotate(${a} 80 34)`} />
          ))}
          <circle cx="80" cy="34" r="7.5" fill="#e8833a" />
          <circle cx="77.3" cy="32.8" r="1.1" fill="#3b2416" />
          <circle cx="82.7" cy="32.8" r="1.1" fill="#3b2416" />
          <path d="M77.5 36 Q80 38.6 82.5 36" fill="none" stroke="#3b2416" strokeWidth="1.1" strokeLinecap="round" />
        </g>
      </g>

      {/* Sparkles around the bloom */}
      {on(6) &&
        [
          [48, 30, 0],
          [114, 42, 0.6],
          [104, 12, 1.2],
        ].map(([x, y, delay]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y - 5} L${x + 1.3} ${y - 1.3} L${x + 5} ${y} L${x + 1.3} ${y + 1.3} L${x} ${y + 5} L${x - 1.3} ${y + 1.3} L${x - 5} ${y} L${x - 1.3} ${y - 1.3} Z`}
            fill="#f2b33d"
            className="animate-twinkle"
            style={{ ...own(), animationDelay: `${delay}s` }}
          />
        ))}

      {/* The pot, with a face that blinks and grins when the flower opens */}
      <ellipse cx="80" cy="101" rx="34" ry="4.5" fill="#6b4a33" />
      <path d="M46 112 L114 112 L105 152 L55 152 Z" fill="#c8643b" />
      <rect x="40" y="100" width="80" height="13" rx="5" fill="#d9845e" />
      <ellipse cx="70" cy="126" rx="2.7" ry="3.4" fill="#3b2416" className="animate-blink" style={own()} />
      <ellipse cx="90" cy="126" rx="2.7" ry="3.4" fill="#3b2416" className="animate-blink" style={own()} />
      <circle cx="63" cy="133" r="4.2" fill="#f2a3a3" opacity="0.6" />
      <circle cx="97" cy="133" r="4.2" fill="#f2a3a3" opacity="0.6" />
      <path
        d={on(6) ? "M73 131 Q80 139 87 131" : "M75.5 132 Q80 135.5 84.5 132"}
        fill="none"
        stroke="#3b2416"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* A bee drops by */}
      <g transform="translate(80 14)">
        <g style={{ opacity: on(7) ? 1 : 0, transition: "opacity 0.5s ease" }}>
          <g className="animate-bee" style={own()}>
            <ellipse cx="-2" cy="-5" rx="3.6" ry="4.6" fill="#ffffff" opacity="0.9" stroke="#cfe3f1" strokeWidth="0.6" className="animate-flap" style={own("50% 100%")} />
            <ellipse cx="2.5" cy="-5" rx="3.2" ry="4.2" fill="#ffffff" opacity="0.9" stroke="#cfe3f1" strokeWidth="0.6" className="animate-flap" style={own("50% 100%")} />
            <ellipse cx="0" cy="0" rx="7" ry="4.6" fill="#f2b33d" stroke="#3b2416" strokeWidth="0.8" />
            <rect x="-2.6" y="-4.3" width="1.7" height="8.6" rx="0.8" fill="#3b2416" />
            <rect x="1.2" y="-4.5" width="1.7" height="9" rx="0.8" fill="#3b2416" />
            <circle cx="5" cy="-1" r="0.9" fill="#3b2416" />
            <path d="M-7 0 L-9.5 -0.8 L-9.5 0.8 Z" fill="#3b2416" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** A seedling that grows on its own: for loading screens with no progress to show. */
export function GrowingPlant({ size, indoor, interval = 450 }: { size?: number; indoor?: boolean; interval?: number }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    // Reduced motion: skip straight to the finished plant.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => setStage(LAST_STAGE));
      return;
    }
    const timer = setInterval(() => setStage((s) => Math.min(LAST_STAGE, s + 1)), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return <PlantScene stage={stage} size={size} indoor={indoor} />;
}

const MESSAGES = [
  "Watering the seedlings…",
  "Tucking in the tomatoes…",
  "Asking the bees for directions…",
  "Counting the basil leaves…",
  "Shooing the squirrels away…",
  "Waiting for the sun to peek out…",
];

/** Full-page loading state (route changes): a growing plant and a rotating, gently silly message. */
export function LoadingScreen({ label }: { label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (label) return;
    const timer = setInterval(() => setI((n) => (n + 1) % MESSAGES.length), 2200);
    return () => clearInterval(timer);
  }, [label]);
  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center animate-appear">
      <GrowingPlant size={136} />
      <p className="mt-2 font-display text-lg font-semibold text-leaf-700">{label ?? MESSAGES[i]}</p>
    </div>
  );
}

/** Three hopping leaves, for "thinking" states. */
export function ThinkingLeaves({ label = "Plantr is thinking…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm font-medium text-leaf-700">
      <span className="flex items-end gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <svg key={i} viewBox="0 0 16 16" className="motion-calm h-4 w-4">
            <g className="animate-hop" style={{ animationDelay: `${i * 0.15}s` }}>
              <path d="M8 15 C8 10 9 6 14 3 C14.5 8 12 11 8 11.5" fill="#67a75a" />
              <path d="M8 15 C8 11 7 8.5 2.5 6.5 C2.5 10.5 5 12.5 8 12.5" fill="#468a3d" />
            </g>
          </svg>
        ))}
      </span>
      {label}
    </div>
  );
}
