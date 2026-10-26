'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfile } from './actions';

export function ProfileForm({ org, initialName, email }: { org: string; initialName: string; email: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setError(null); setSaved(false);
    startTransition(async () => {
      const res = await updateProfile(org, name);
      if (res?.error) setError(res.error);
      else { setSaved(true); router.refresh(); }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block px-1 text-[13px] font-medium text-zinc-400">Imię i nazwisko</label>
        <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }}
          placeholder="Jan Kowalski"
          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
        <p className="mt-1.5 px-1 text-[12px] text-zinc-500">Ta nazwa jest widoczna m.in. na liście obecności i przy głosowaniach jawnych.</p>
      </div>
      <div>
        <label className="mb-2 block px-1 text-[13px] font-medium text-zinc-400">Email</label>
        <input value={email} disabled
          className="h-12 w-full cursor-not-allowed rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-[16px] text-zinc-500" />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button disabled={isPending} onClick={save}
          className="press h-11 rounded-xl bg-indigo-600 px-5 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {isPending ? 'Zapisywanie…' : 'Zapisz'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Zapisano</span>}
      </div>
    </div>
  );
}
