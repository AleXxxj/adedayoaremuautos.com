/**
 * Inline icon set.
 *
 * Drawn on a 24px grid at 1.5 stroke so they sit optically level with the type.
 * Inline rather than a font or sprite: no extra request, no FOUT, and each one
 * inherits currentColor so it works in both themes without a second asset.
 */

export type IconName =
  | "car" | "key" | "wallet" | "shield" | "check" | "truck"
  | "document" | "headset" | "spark" | "gauge" | "calendar" | "phone"
  | "arrow" | "pin" | "clock" | "star";

const PATHS: Record<IconName, React.ReactNode> = {
  car: (
    <>
      <path d="M5 17h14M6.5 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm14 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
      <path d="M3 17v-4l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4M5 13h14" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 8 8m-3-3 2-2m-4 4 2-2" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 8h16a2 2 0 0 1 2 2v2h-5a2 2 0 0 0 0 4h5" />
    </>
  ),
  shield: <path d="M12 3 5 6v5.5c0 4 3 7.6 7 9.5 4-1.9 7-5.5 7-9.5V6l-7-3Z" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7h11v10H3zM14 10h3.6a2 2 0 0 1 1.7 1l1.7 3v3h-7" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17.5" cy="18" r="1.6" />
    </>
  ),
  document: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  headset: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14a2 2 0 0 1 2-2h1v5H6a2 2 0 0 1-2-2v-1Zm16 0a2 2 0 0 0-2-2h-1v5h1a2 2 0 0 0 2-2v-1Z" />
      <path d="M17 17v1a3 3 0 0 1-3 3h-2" />
    </>
  ),
  spark: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8M8.4 15.6l-2.8 2.8" />,
  gauge: (
    <>
      <path d="M4 18a9 9 0 1 1 16 0" />
      <path d="m12 14 4-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  phone: <path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  pin: (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  star: <path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8L12 4Z" />,
};

export function Icon({
  name,
  className = "size-5",
  strokeWidth = 1.5,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Icon in a bordered disc — the badge treatment, done with restraint. */
export function IconBadge({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--brand-500)]/25 bg-[var(--brand-500)]/10 text-[var(--brand-400)] ${className}`}
    >
      <Icon name={name} className="size-5" />
    </span>
  );
}
