import Link from 'next/link';

/** Frame for the public (no-login) pages: registry, resolution, transmission. */
export function PublicShell({
  orgName, slug, children, width = 'max-w-2xl',
}: {
  orgName?: string | null;
  slug: string;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="pt-safe pb-safe min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl print:hidden">
        <div className={`mx-auto flex h-14 items-center gap-2.5 px-4 ${width}`}>
          <Link href={`/${slug}/rejestr`} className="press flex min-w-0 items-center gap-2.5 rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" className="h-7 w-7 shrink-0 rounded-lg" />
            <span className="truncate text-[15px] font-semibold tracking-tight text-zinc-100">{orgName ?? 'RadaStudentów24'}</span>
          </Link>
        </div>
      </header>
      <main className={`mx-auto px-4 py-8 ${width}`}>{children}</main>
    </div>
  );
}
