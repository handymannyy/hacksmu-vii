interface Props {
  score: number;
  size?: number;
}

export default function ScoreGauge({ score, size = 120 }: Props) {
  const radius = (size - 16) / 2;
  const circumference = Math.PI * radius; // half-circle arc length
  const progress = (score / 100) * circumference;

  // Interpolate color: red → amber → green
  const color =
    score >= 67 ? "#22c55e" : score >= 33 ? "#f59e0b" : "#ef4444";

  const cx = size / 2;
  const cy = size / 2 + 8; // shift down slightly so text fits

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`}>
        {/* Track */}
        <path
          d={`M 8,${cy} A ${radius},${radius} 0 0,1 ${size - 8},${cy}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* Progress */}
        <path
          d={`M 8,${cy} A ${radius},${radius} 0 0,1 ${size - 8},${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease" }}
        />
        {/* Score number */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fill={color}
          fontSize={size * 0.26}
          fontWeight="700"
          fontFamily="Inter, sans-serif"
        >
          {Math.round(score)}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fill="#64748b"
          fontSize={size * 0.11}
          fontFamily="Inter, sans-serif"
        >
          / 100
        </text>
      </svg>
      <span
        className="text-xs font-semibold tracking-wider uppercase px-2 py-0.5 rounded"
        style={{ color, background: `${color}22` }}
      >
        {score >= 67 ? "High" : score >= 33 ? "Medium" : "Low"} Viability
      </span>
    </div>
  );
}
