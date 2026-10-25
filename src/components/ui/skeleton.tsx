import { clsx } from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('animate-pulse rounded-lg bg-zinc-800/70', className)} />;
}

/** Generic list-page placeholder: title + a few rows. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Ładowanie">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="mt-2 h-4 w-60" />
      <div className="mt-7 space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-zinc-800/70 px-4 py-3.5">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
