'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { ResolutionStatus } from '@/types/database';
import { runAi, runAiStream } from '@/lib/ai';
import { saveResolution } from '../actions';

const STATUS_LABEL: Record<ResolutionStatus, string> = {
  draft: 'Szkic', adopted: 'Uchwalona', published: 'Opublikowana', revoked: 'Uchylona',
};
const STATUSES = Object.keys(STATUS_LABEL) as ResolutionStatus[];

export function ResolutionEditor({
  org, id, signature, sessionTitle, canEdit, signerName, signedAt, initial,
}: {
  org: string;
  id: string;
  signature: string;
  sessionTitle: string;
  canEdit: boolean;
  signerName: string | null;
  signedAt: string | null;
  initial: {
    title: string; body: string; legal_basis: string; status: ResolutionStatus;
    title_en: string; body_en: string; legal_basis_en: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [legalBasis, setLegalBasis] = useState(initial.legal_basis);
  const [titleEn, setTitleEn] = useState(initial.title_en);
  const [bodyEn, setBodyEn] = useState(initial.body_en);
  const [legalBasisEn, setLegalBasisEn] = useState(initial.legal_basis_en);
  const [showEn, setShowEn] = useState(!!(initial.title_en || initial.body_en));
  const [status, setStatus] = useState<ResolutionStatus>(initial.status);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ai, setAi] = useState<null | 'format' | 'translate'>(null);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  const formatWithAi = async () => {
    if (!body.trim() || !confirm('Sformatować treść przez AI? Wynik zastąpi obecną treść (możesz cofnąć nie zapisując).')) return;
    const input = body;
    setAi('format'); setAiMsg(null); setBody('');
    const res = await runAiStream('format_resolution', input, (d) => setBody((b) => b + d));
    if (res.error) { setBody(input); setAiMsg(res.error); }
    else { setSaved(false); setAiMsg('✓ AI sformatowało treść — sprawdź i zapisz.'); }
    setAi(null);
  };

  const translateWithAi = async () => {
    setAi('translate'); setAiMsg(null);
    const empty = (): Promise<{ text?: string; error?: string }> => Promise.resolve({ text: '' });
    const [t, l, b] = await Promise.all([
      title.trim() ? runAi('translate_en', title) : empty(),
      legalBasis.trim() ? runAi('translate_en', legalBasis) : empty(),
      body.trim() ? runAi('translate_en', body) : empty(),
    ]);
    const err = t.error ?? l.error ?? b.error;
    if (err) { setAiMsg(err); setAi(null); return; }
    setTitleEn(t.text ?? ''); setLegalBasisEn(l.text ?? ''); setBodyEn(b.text ?? '');
    setShowEn(true); setSaved(false);
    setAiMsg('✓ AI przetłumaczyło na EN — sprawdź i zapisz.');
    setAi(null);
  };

  const save = () => {
    setError(null); setSaved(false);
    startTransition(async () => {
      const res = await saveResolution(org, id, {
        title, body, legal_basis: legalBasis, status,
        title_en: titleEn, body_en: bodyEn, legal_basis_en: legalBasisEn,
      });
      if (res?.error) setError(res.error);
      else { setSaved(true); router.refresh(); }
    });
  };

  return (
    <div>
      <div className="mb-6">
        <Link href={`/${org}/resolutions`} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Rejestr uchwał
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-zinc-100">{signature}</h1>
          <Link href={`/${org}/resolutions/${id}/print`} target="_blank"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors">
            Wersja do druku / PDF ↗
          </Link>
        </div>
        <p className="mt-1 text-xs text-zinc-600">
          z posiedzenia: {sessionTitle}
          {signedAt && signerName && ` · podpisał(a): ${signerName}, ${format(new Date(signedAt), 'd MMMM yyyy', { locale: pl })}`}
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {!canEdit ? (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-100">{title}</h2>
          {legalBasis && <p className="text-sm italic text-zinc-400">{legalBasis}</p>}
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">{body}</pre>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Tytuł (w sprawie…)</label>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Podstawa prawna</label>
            <input value={legalBasis} onChange={(e) => { setLegalBasis(e.target.value); setSaved(false); }}
              placeholder="Na podstawie § … Regulaminu …"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Treść</label>
            <textarea value={body} onChange={(e) => { setBody(e.target.value); setSaved(false); }} spellCheck={false}
              className="h-[40vh] w-full rounded-md border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm leading-relaxed text-zinc-100 focus:border-indigo-500 focus:outline-none" />
          </div>

          {/* AI assistant */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={formatWithAi} disabled={ai !== null}
              className="rounded-md border border-indigo-800 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-950/40 disabled:opacity-50 transition-colors">
              {ai === 'format' ? 'AI pracuje…' : 'Sformatuj treść (AI)'}
            </button>
            <button type="button" onClick={translateWithAi} disabled={ai !== null}
              className="rounded-md border border-indigo-800 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-950/40 disabled:opacity-50 transition-colors">
              {ai === 'translate' ? 'AI tłumaczy…' : 'Przetłumacz na EN (AI)'}
            </button>
            {aiMsg && <span className="text-xs text-zinc-400">{aiMsg}</span>}
          </div>

          {/* English version (optional) */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <button type="button" onClick={() => setShowEn((v) => !v)}
              className="flex w-full items-center justify-between text-sm text-zinc-300">
              <span>Wersja angielska (EN) — opcjonalna</span>
              <span className="text-xs text-zinc-500">{showEn ? 'ukryj ▲' : 'pokaż ▼'}</span>
            </button>
            {showEn && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Title (on…)</label>
                  <input value={titleEn} onChange={(e) => { setTitleEn(e.target.value); setSaved(false); }}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Legal basis</label>
                  <input value={legalBasisEn} onChange={(e) => { setLegalBasisEn(e.target.value); setSaved(false); }}
                    placeholder="Pursuant to § … of the Regulations …"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Body</label>
                  <textarea value={bodyEn} onChange={(e) => { setBodyEn(e.target.value); setSaved(false); }} spellCheck={false}
                    className="h-[30vh] w-full rounded-md border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm leading-relaxed text-zinc-100 focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as ResolutionStatus)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button disabled={isPending} onClick={save}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
              {isPending ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            {saved && <span className="text-xs text-emerald-400">✓ Zapisano</span>}
            <span className="text-xs text-zinc-600">Ustawienie „Uchwalona"/„Opublikowana" podpisuje uchwałę.</span>
          </div>
        </div>
      )}
    </div>
  );
}
