import Link from "next/link";

export function TagPill({
  id,
  name,
  category,
  emphasis = "normal",
}: {
  id: string;
  name: string;
  category?: string;
  emphasis?: "normal" | "strong";
}) {
  const base =
    "inline-flex items-center text-xs px-2 py-0.5 rounded transition-colors";
  const colors =
    emphasis === "strong"
      ? "bg-surface-border-strong text-surface-foreground font-medium hover:bg-surface-emphasis"
      : "bg-surface-emphasis text-surface-foreground hover:bg-surface-border-strong";

  return (
    <Link href={`/terrain/${id}`}
      className={`${base} ${colors}`}
      title={category}
    >
      {name}
    </Link>
  );
}