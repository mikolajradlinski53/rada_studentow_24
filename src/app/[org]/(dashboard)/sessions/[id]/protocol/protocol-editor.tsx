'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { ProtocolStatus } from '@/types/database';
import { generateProtocol, saveProtocol } from './actions';

const STATUS_LABEL: Record<ProtocolStatus, string> = {
  draft: 'Szkic', review: 'W recenzji', approved: 'Zatwierdzony', published: 'Opublikowany',
};
const STATUSES = Object.keys(STATUS_LABEL) as ProtocolStatus[];

export function ProtocolEditor({
  org, sessionId, sessionTitle, canEdit, initialBody, initialStatus, generatedAt,
}: {
  org: string;
  sessionId: string;
  sessionTitle: string;
  canEdit: boolean;
  initialBody: string | null;
  initialStatus: ProtocolStatus;
  generatedAt: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState(initialBody ?? '');
  const [status, setStatus] = useState<ProtocolStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const hasProtocol = initialBody !== null;

  const run = (fn: () => Promise<{ ok?: true; error?: string }>, after?: () => void) => {
    setError(null); setSaved(false);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else { after?.(); router.refresh(); }
    });
  };

  const generate = () => {
    if (hasProtocol && !confirm('Wygenerować szkielet ponownie? Nadpisze obecną treść.')) return;
    run(() => generateProtocol(org, sessionId));
  };

  return (
    <div>
      <div className="mb-6">
        <Link href={`/${org}/sessions/${sessionId}`} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← {sessionTitle}
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-zinc-100">Protokół</h1>
          {canEdit && (
            <button onClick={generate} disabled={isPending}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50 transition-colors">
              {hasProtocol ? 'Regeneruj szkielet' : 'Generuj szkielet'}
            </button>
          )}
        </div>
        {generatedAt && (
          <p className="mt-1 text-xs text-zinc-600">
            Szkielet wygenerowany {format(new Date(generatedAt), "d MMMM yyyy, HH:mm", { locale: pl })}
          </p>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {!hasProtocol ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-10 text-center">
          <p className="text-sm text-zinc-400">Protokół nie został jeszcze wygenerowany.</p>
          {canEdit ? (
            <p className="mt-1 text-xs text-zinc-600">Kliknij „Generuj szkielet", aby utworzyć protokół z danych posiedzenia.</p>
          ) : (
            <p className="mt-1 text-xs text-zinc-600">Poczekaj, aż prowadzący wygeneruje protokół.</p>
          )}
        </div>
      ) : canEdit ? (
        <div className="space-y-3">
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setSaved(false); }}
            spellCheck={false}
            className="h-[60vh] w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-sm leading-relaxed text-zinc-200 focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as ProtocolStatus)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button disabled={isPending}
              onClick={() => run(() => saveProtocol(org, sessionId, body, status), () => setSaved(true))}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
              {isPending ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            {saved && <span className="text-xs text-emerald-400">✓ Zapisano</span>}
          </div>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-sm leading-relaxed text-zinc-300">
          {body}
        </pre>
      )}
    </div>
  );
}
