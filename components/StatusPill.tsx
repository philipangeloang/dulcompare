export type StatusKind = "match" | "diff" | "a-only" | "b-only" | "neutral";

export const KIND_CLASSES: Record<StatusKind, string> = {
  match: "bg-match-bg text-match",
  diff: "bg-diff-bg text-diff",
  "a-only": "bg-a-only-bg text-a-only",
  "b-only": "bg-b-only-bg text-b-only",
  neutral: "bg-surface-2 text-muted",
};

/**
 * Single source of truth for mapping a diff-row status string to a
 * StatusPill color kind. Shared across every screen that renders statuses.
 */
export function statusKind(
  status: string,
  siteALabel?: string,
  siteBLabel?: string,
): StatusKind {
  if (status.startsWith("match")) return "match";
  if (status === "value_diff" || status === "has_diff") return "diff";
  if (siteALabel && status === `${siteALabel}_only`) return "a-only";
  if (siteBLabel && status === `${siteBLabel}_only`) return "b-only";
  return "neutral";
}

export default function StatusPill({
  status,
  siteALabel,
  siteBLabel,
}: {
  status: string;
  siteALabel?: string;
  siteBLabel?: string;
}) {
  const kind = statusKind(status, siteALabel, siteBLabel);
  return <span className={`pill ${KIND_CLASSES[kind]}`}>{status}</span>;
}
