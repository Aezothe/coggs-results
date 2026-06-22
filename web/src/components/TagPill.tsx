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
      ? "bg-gray-200 text-gray-800 font-medium hover:bg-gray-300"
      : "bg-gray-100 text-gray-700 hover:bg-gray-200";

  return (
    <Link href={`/terrain/${id}`}
      className={`${base} ${colors}`}
      title={category}
    >
      {name}
    </Link>
  );
}