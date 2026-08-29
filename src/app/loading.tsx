import { SkeletonCard } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="panel h-48 animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </div>
  );
}
