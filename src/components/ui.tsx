import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Small design-system primitives shared across the app.

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "sun";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-leaf-600 text-white hover:bg-leaf-700 active:bg-leaf-800 shadow-sm",
  secondary: "bg-paper text-ink border border-line-strong hover:border-leaf-400 hover:bg-leaf-50",
  ghost: "text-leaf-700 hover:bg-leaf-50",
  danger: "bg-paper text-clay-700 border border-clay-100 hover:bg-clay-50",
  sun: "bg-sun-400 text-ink hover:bg-sun-300 shadow-sm",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-14 px-7 text-base gap-2.5",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string): string {
  return cx(
    "inline-flex items-center justify-center rounded-full font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-[var(--radius-card)] bg-paper border border-line shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function Chip({
  children,
  tone = "leaf",
  className,
}: {
  children: ReactNode;
  tone?: "leaf" | "sun" | "clay" | "neutral" | "sky";
  className?: string;
}) {
  const tones = {
    leaf: "bg-leaf-50 text-leaf-700 border-leaf-100",
    sun: "bg-sun-50 text-sun-600 border-sun-100",
    clay: "bg-clay-50 text-clay-700 border-clay-100",
    neutral: "bg-cream text-muted border-line",
    sky: "bg-sky-50 text-sky-500 border-sky-50",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.14em] text-leaf-600">{eyebrow}</p>}
      <h2 className="font-display text-2xl font-semibold text-ink sm:text-[28px]">{title}</h2>
      {children && <p className="mt-1 text-[15px] text-muted">{children}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className ?? "h-5 w-5")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-display text-xl font-semibold text-leaf-700", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <circle cx="16" cy="16" r="16" fill="var(--color-leaf-600)" />
        <path d="M16 25v-9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M16 17c0-4.5 3-7.5 8-7.5 0 4.6-3.2 7.5-8 7.5Z" fill="var(--color-sun-400)" />
        <path d="M16 19.5c0-3.6-2.4-6-6.5-6 0 3.7 2.6 6 6.5 6Z" fill="#fff" />
      </svg>
      Plantr
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-paper/60 px-6 py-10 text-center">
      <div className="mb-3 text-4xl" aria-hidden>
        {icon}
      </div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {children && <div className="mt-2 max-w-sm text-[15px] text-muted">{children}</div>}
    </div>
  );
}
