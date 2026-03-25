import { ResultDrawIcon, ResultLossIcon, ResultWinIcon } from "@/components/app-icons";

function normalizeResult(result: string) {
  const normalized = result.trim().toLowerCase();
  if (normalized === "win") {
    return {
      label: "Win",
      className: "border-emerald-500/25 bg-emerald-500/14 text-[color:var(--success-text)]",
      Icon: ResultWinIcon
    };
  }

  if (normalized === "loss") {
    return {
      label: "Loss",
      className: "border-rose-500/25 bg-rose-500/14 text-[color:var(--error-text)]",
      Icon: ResultLossIcon
    };
  }

  if (normalized === "draw") {
    return {
      label: "Draw",
      className: "border-amber-500/25 bg-amber-500/14 text-[color:var(--warning-text)]",
      Icon: ResultDrawIcon
    };
  }

  return {
    label: result || "Unknown",
    className: "border-[color:var(--border)] bg-[color:var(--panel-soft)] text-muted-strong",
    Icon: null
  };
}

export function ResultPill(props: { result: string; compact?: boolean }) {
  const config = normalizeResult(props.result);
  const Icon = config.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold uppercase tracking-[0.14em] ${props.compact ? "text-[10px]" : "text-[11px]"} ${config.className}`}
    >
      {Icon ? <Icon className={props.compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> : null}
      <span>{config.label}</span>
    </span>
  );
}
