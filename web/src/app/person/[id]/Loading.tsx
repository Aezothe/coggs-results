export default function Loading() {
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-4 bg-gray-100 rounded w-1/4 mb-6" />

        <div className="mb-8">
          <div className="h-6 bg-gray-200 rounded w-32 mb-3" />
          <div className="border border-gray-200 rounded">
            <div className="h-10 bg-gray-100 border-b border-gray-200" />
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-10 border-b border-gray-100 last:border-b-0"
              />
            ))}
          </div>
        </div>

        <div className="h-64 bg-gray-100 rounded mb-8" />

        <div>
          <div className="h-6 bg-gray-200 rounded w-32 mb-3" />
          <div className="border border-gray-200 rounded">
            <div className="h-10 bg-gray-100 border-b border-gray-200" />
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-10 border-b border-gray-100 last:border-b-0"
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}