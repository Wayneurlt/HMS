export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-card" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-card bg-card" />
        ))}
      </div>
      <div className="h-72 rounded-card bg-card" />
    </div>
  );
}
