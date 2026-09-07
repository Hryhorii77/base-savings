// Base's own brand blue (#0052FF) is the one deliberate brand color in this
// app — used only here and in icon.tsx so the mark and the favicon match.
export const BASE_BLUE = "#0052FF";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" role="img" aria-label="Base Savings">
      <rect width="28" height="28" rx="8" fill={BASE_BLUE} />
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="15"
      >
        B
      </text>
    </svg>
  );
}
