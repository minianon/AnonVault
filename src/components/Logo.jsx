/* The AnonVault mark: a daily log in a rounded frame. Lines get shorter as
   the day's list gets done; the last, accented line is what's left to do.
   Strokes thicken at small sizes so it stays crisp at 16–20px. */
export default function Logo({ size = 22, className = '' }) {
  const small = size <= 20;
  const frame = small ? 2.6 : 2.2;
  const line = small ? 3 : 2.6;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" rx="7" stroke="#EDEDEF" strokeWidth={frame} />
      <g strokeLinecap="round" strokeWidth={line}>
        <path d="M10 11.5h12" stroke="#EDEDEF" />
        <path d="M10 16h8" stroke="#EDEDEF" />
        <path d="M10 20.5h4" stroke="#4F7BFF" />
      </g>
    </svg>
  );
}
