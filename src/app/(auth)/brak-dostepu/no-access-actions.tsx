'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function NoAccessActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-8 space-y-2.5">
      <button
        onClick={() => { setBusy(true); router.replace('/'); router.refresh(); }}
        disabled={busy}
        className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        <RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        Sprawdź ponownie
      </button>
      <button
        onClick={async () => { await createClient().auth.signOut(); router.replace('/login'); }}
        className="press h-12 w-full rounded-xl text-[15px] text-zinc-400 hover:text-zinc-200"
      >
        Zaloguj się innym adresem
      </button>
    </div>
  );
}
