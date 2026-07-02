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
        <label className="mb-1 block text-xs text-zinc-400">Imię i nazwisko</label>
        <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }}
          placeholder="Jan Kowalski"
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none" />
        <p className="mt-1 text-xs text-zinc-600">Ta nazwa jest widoczna m.in. na liście obecności i przy głosowaniach jawnych.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Email</label>
        <input value={email} disabled
          className="w-full cursor-not-allowed rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-500" />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button disabled={isPending} onClick={save}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
          {isPending ? 'Zapisywanie…' : 'Zapisz'}
        </button>
        {saved && <span className="text-xs text-emerald-400">✓ Zapisano</span>}
      </div>
    </div>
  );
}
