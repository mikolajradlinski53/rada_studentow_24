'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { clsx } from 'clsx';
import { Check, ChevronLeft, FileDown, Mic, RefreshCw, ScrollText, Sparkles } from 'lucide-react';
import type { ProtocolStatus } from '@/types/database';
import { runAiStream } from '@/lib/ai';
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
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMsg, setTranscribeMsg] = useState<string | null>(null);
  const hasProtocol = initialBody !== null;

  const [aiBusy, setAiBusy] = useState(false);

  const polishWithAi = async () => {
    if (!body.trim() || !confirm('Przepuścić protokół przez AI? Wynik zastąpi obecną treść (możesz cofnąć nie zapisując).')) return;
    const input = body;
    setAiBusy(true); setTranscribeMsg(null); setBody('');
    const res = await runAiStream('polish', input, (d) => setBody((b) => b + d));
    if (res.error) { setBody(input); setTranscribeMsg(res.error); }
    else { setSaved(false); setTranscribeMsg('AI sformatowało protokół, sprawdź i zapisz.'); }
    setAiBusy(false);
  };

  const transcribe = async (file: File) => {
    setTranscribing(true); setTranscribeMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setTranscribeMsg(data.error ?? 'Nie udało się przetranskrybować.'); return; }
      setBody((b) => `${b}\n\n${(data.text as string).trim()}`.trim());
      setSaved(false);
      setTranscribeMsg('Dodano transkrypcję na końcu, sprawdź i zapisz.');
    } catch {
      setTranscribeMsg('Błąd sieci podczas transkrypcji.');
    } finally {
      setTranscribing(false);
    }
  };

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
      <Link href={`/${org}/sessions/${sessionId}`}
        className="press -ml-2 mb-3 inline-flex h-9 max-w-full items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
        <ChevronLeft className="h-5 w-5 shrink-0" /> <span className="truncate">{sessionTitle}</span>
      </Link>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">Protokół</h1>
          {hasProtocol && (
            <Link href={`/${org}/sessions/${sessionId}/protocol/print`}
              className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-sm font-medium text-zinc-200 hover:border-zinc-500">
              <FileDown className="h-4 w-4" /> PDF
            </Link>
          )}
        </div>
        {generatedAt && (
          <p className="mt-1 text-[13px] text-zinc-500">
            Szkielet wygenerowany {format(new Date(generatedAt), "d MMMM yyyy, 'godz.' HH:mm", { locale: pl })}
          </p>
        )}
        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={generate} disabled={isPending}
              className="press flex h-10 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-[13px] font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50">
              <RefreshCw className="h-4 w-4" /> {hasProtocol ? 'Wygeneruj ponownie' : 'Generuj szkielet'}
            </button>
            {hasProtocol && (
              <button onClick={polishWithAi} disabled={isPending || aiBusy}
                className="press flex h-10 items-center gap-1.5 rounded-xl border border-indigo-800/70 bg-indigo-950/30 px-3.5 text-[13px] font-medium text-indigo-300 hover:bg-indigo-950/60 disabled:opacity-50">
                <Sparkles className="h-4 w-4" /> {aiBusy ? 'AI pracuje…' : 'Ulepsz (AI)'}
              </button>
            )}
            {hasProtocol && (
              <label className={clsx('press flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-[13px] font-medium text-zinc-200 hover:border-zinc-500',
                transcribing && 'pointer-events-none opacity-50')}>
                <Mic className="h-4 w-4" /> {transcribing ? 'Transkrybuję…' : 'Wgraj nagranie'}
                <input type="file" accept="audio/*" className="hidden" disabled={transcribing}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) transcribe(f); e.target.value = ''; }} />
              </label>
            )}
          </div>
        )}
        {canEdit && hasProtocol && (
          <p className="mt-2 px-1 text-[12px] text-zinc-500">Nagranie do 24 MB (dłuższe podziel). Transkrypcja dopisze się na końcu.</p>
        )}
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-sm text-red-300">{error}</p>}
      {transcribeMsg && <p className="mb-4 rounded-xl bg-zinc-900/60 px-3.5 py-2.5 text-[13px] text-zinc-300 ring-1 ring-zinc-800">{transcribeMsg}</p>}

      {!hasProtocol ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <ScrollText className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-[15px] text-zinc-300">Protokołu jeszcze nie ma</p>
          <p className="mt-1 text-[13px] text-zinc-500">
            {canEdit
              ? 'Wygeneruj szkielet: obecność, kworum, porządek obrad i wyniki głosowań uzupełnią się same.'
              : 'Pojawi się tutaj, gdy prowadzący go przygotuje.'}
          </p>
        </div>
      ) : canEdit ? (
        <div className="space-y-4">
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setSaved(false); }}
            spellCheck={false}
            aria-label="Treść protokołu"
            className="h-[60vh] w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-[14px] leading-relaxed text-zinc-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
          />
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="px-1 text-[13px] font-medium text-zinc-400">Status</div>
            <div role="radiogroup" aria-label="Status protokołu" className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-950/60 p-1 ring-1 ring-zinc-800 sm:grid-cols-4">
              {STATUSES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => { setStatus(s); setSaved(false); }}
                  className={clsx('h-10 rounded-lg text-[14px] font-medium transition-colors',
                    status === s ? 'bg-zinc-700/80 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <button disabled={isPending}
              onClick={() => run(() => saveProtocol(org, sessionId, body, status), () => setSaved(true))}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              {saved ? <><Check className="h-4 w-4" /> Zapisano</> : isPending ? 'Zapisywanie…' : 'Zapisz protokół'}
            </button>
          </div>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 font-sans text-[15px] leading-relaxed text-zinc-300">
          {body}
        </pre>
      )}
    </div>
  );
}
