'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { clsx } from 'clsx';
import { Check, ChevronDown, ChevronLeft, FileDown, Languages, Sparkles } from 'lucide-react';
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
    else { setSaved(false); setAiMsg('AI sformatowało treść, sprawdź i zapisz.'); }
    setAi(null);
  };

  const translateWithAi = async () => {
    setAi('translate'); setAiMsg(null); setShowEn(true);
    const empty = (): Promise<{ text?: string; error?: string }> => Promise.resolve({ text: '' });

    // Short fields first (awaited), then the long body streamed live into EN.
    const [t, l] = await Promise.all([
      title.trim() ? runAi('translate_en', title) : empty(),
      legalBasis.trim() ? runAi('translate_en', legalBasis) : empty(),
    ]);
    if (t.error ?? l.error) { setAiMsg((t.error ?? l.error)!); setAi(null); return; }
    setTitleEn(t.text ?? ''); setLegalBasisEn(l.text ?? '');

    if (body.trim()) {
      setBodyEn('');
      const res = await runAiStream('translate_en', body, (d) => setBodyEn((b) => b + d));
      if (res.error) { setAiMsg(res.error); setAi(null); return; }
    } else {
      setBodyEn('');
    }

    setSaved(false);
    setAiMsg('AI przetłumaczyło na EN, sprawdź i zapisz.');
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

  const input = 'h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';
  const area = 'w-full rounded-xl border border-zinc-700 bg-zinc-800/80 p-4 font-mono text-[14px] leading-relaxed text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';
  const label = 'mb-2 block px-1 text-[13px] font-medium text-zinc-400';

  return (
    <div>
      <Link href={`/${org}/resolutions`}
        className="press -ml-2 mb-3 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
        <ChevronLeft className="h-5 w-5" /> Uchwały
      </Link>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-50">{signature}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            Z posiedzenia: {sessionTitle}
            {signedAt && signerName && <><br />Podpisał(a): {signerName}, {format(new Date(signedAt), 'd MMMM yyyy', { locale: pl })}</>}
          </p>
        </div>
        <Link href={`/${org}/resolutions/${id}/print`} target="_blank"
          className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-sm font-medium text-zinc-200 hover:border-zinc-500">
          <FileDown className="h-4 w-4" /> PDF
        </Link>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-sm text-red-300">{error}</p>}

      {!canEdit ? (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-[17px] font-semibold text-zinc-100">{title}</h2>
          {legalBasis && <p className="mt-2 text-[14px] italic text-zinc-400">{legalBasis}</p>}
          <pre className="mt-4 whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-zinc-300">{body}</pre>
        </article>
      ) : (
        <div className="space-y-5">
          <div>
            <label htmlFor="res-title" className={label}>Tytuł (w sprawie…)</label>
            <input id="res-title" value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} className={input} />
          </div>
          <div>
            <label htmlFor="res-basis" className={label}>Podstawa prawna</label>
            <input id="res-basis" value={legalBasis} onChange={(e) => { setLegalBasis(e.target.value); setSaved(false); }}
              placeholder="Na podstawie § … Regulaminu …" className={input} />
          </div>
          <div>
            <label htmlFor="res-body" className={label}>Treść</label>
            <textarea id="res-body" value={body} onChange={(e) => { setBody(e.target.value); setSaved(false); }} spellCheck={false}
              className={clsx(area, 'h-[40vh]')} />
          </div>

          {/* AI assistant */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={formatWithAi} disabled={ai !== null}
              className="press flex h-10 items-center gap-1.5 rounded-xl border border-indigo-800/70 bg-indigo-950/30 px-3.5 text-[13px] font-medium text-indigo-300 hover:bg-indigo-950/60 disabled:opacity-50">
              <Sparkles className="h-4 w-4" /> {ai === 'format' ? 'AI pracuje…' : 'Sformatuj (AI)'}
            </button>
            <button type="button" onClick={translateWithAi} disabled={ai !== null}
              className="press flex h-10 items-center gap-1.5 rounded-xl border border-indigo-800/70 bg-indigo-950/30 px-3.5 text-[13px] font-medium text-indigo-300 hover:bg-indigo-950/60 disabled:opacity-50">
              <Languages className="h-4 w-4" /> {ai === 'translate' ? 'AI tłumaczy…' : 'Przetłumacz na EN'}
            </button>
            {aiMsg && <span className="text-[13px] text-zinc-400">{aiMsg}</span>}
          </div>

          {/* English version (optional) */}
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
            <button type="button" onClick={() => setShowEn((v) => !v)} aria-expanded={showEn}
              className="press flex h-12 w-full items-center justify-between px-4 text-[15px] text-zinc-200">
              <span>Wersja angielska <span className="text-zinc-500">(opcjonalna)</span></span>
              <ChevronDown className={clsx('h-4 w-4 text-zinc-500 transition-transform duration-200', showEn && 'rotate-180')} />
            </button>
            {showEn && (
              <div className="space-y-4 border-t border-zinc-800/80 p-4">
                <div>
                  <label htmlFor="res-title-en" className={label}>Title (on…)</label>
                  <input id="res-title-en" value={titleEn} onChange={(e) => { setTitleEn(e.target.value); setSaved(false); }} className={input} />
                </div>
                <div>
                  <label htmlFor="res-basis-en" className={label}>Legal basis</label>
                  <input id="res-basis-en" value={legalBasisEn} onChange={(e) => { setLegalBasisEn(e.target.value); setSaved(false); }}
                    placeholder="Pursuant to § … of the Regulations …" className={input} />
                </div>
                <div>
                  <label htmlFor="res-body-en" className={label}>Body</label>
                  <textarea id="res-body-en" value={bodyEn} onChange={(e) => { setBodyEn(e.target.value); setSaved(false); }} spellCheck={false}
                    className={clsx(area, 'h-[30vh]')} />
                </div>
              </div>
            )}
          </div>

          {/* Status + save */}
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className={label + ' mb-0'}>Status</div>
            <div role="radiogroup" aria-label="Status uchwały" className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-950/60 p-1 ring-1 ring-zinc-800 sm:grid-cols-4">
              {STATUSES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => { setStatus(s); setSaved(false); }}
                  className={clsx('h-10 rounded-lg text-[14px] font-medium transition-colors',
                    status === s ? 'bg-zinc-700/80 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="px-1 text-[13px] text-zinc-500">Status „Uchwalona” lub „Opublikowana” podpisuje uchwałę Twoim imieniem.</p>
            <button disabled={isPending} onClick={save}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              {saved ? <><Check className="h-4 w-4" /> Zapisano</> : isPending ? 'Zapisywanie…' : 'Zapisz uchwałę'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
