export function SkeletonText({
  width = "w-1/3",
  height = "h-4",
  className = "",
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`${height} ${width} bg-gray-200 rounded animate-pulse ${className}`}
    />
  );
}

export function SkeletonHeader() {
  return (
    <div className="mb-6">
      <SkeletonText width="w-1/3" height="h-8" className="mb-3" />
      <SkeletonText width="w-1/4" height="h-4" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="border border-gray-200 rounded overflow-hidden mb-6 animate-pulse">
      <div className="h-10 bg-gray-100 border-b border-gray-200" />
      {[...Array(rows)].map((_, i) => (
        <div
          key={i}
          className="h-10 border-b border-gray-100 last:border-b-0"
        />
      ))}
    </div>
  );
}

export function SkeletonChart({ height = "h-64" }: { height?: string }) {
  return (
    <div
      className={`${height} bg-gray-100 rounded animate-pulse mb-6`}
    />
  );
}

export function SkeletonSection({ titleWidth = "w-32" }: { titleWidth?: string }) {
  return (
    <div className="mb-6">
      <SkeletonText width={titleWidth} height="h-6" className="mb-3" />
      <SkeletonTable rows={4} />
    </div>
  );
}

export function SkeletonPage({
  children,
  maxWidth = "max-w-5xl",
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className={`p-6 ${maxWidth} mx-auto`}>
      <SkeletonHeader />
      {children}
    </main>
  );
}