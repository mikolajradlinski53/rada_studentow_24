/** Presentational uchwała document (white, printable). Shared by the authenticated
 *  print view and the public registry. Language-agnostic — the caller passes the
 *  fields for the selected language (PL or EN). */
export function ResolutionDocument({
  orgName, signature, title, legalBasis, body, dateStr, signer, lang = 'pl',
}: {
  orgName: string;
  signature: string;
  title: string;
  legalBasis: string | null;
  body: string;
  dateStr: string;
  signer: string | null;
  lang?: 'pl' | 'en';
}) {
  const t = lang === 'en'
    ? { inCase: 'on', signer: 'Chair', dateWord: 'of' }
    : { inCase: 'w sprawie', signer: 'Przewodniczący', dateWord: 'z dnia' };

  return (
    <article className="theme-fixed mx-auto max-w-3xl rounded-lg bg-white p-10 text-zinc-900 shadow-xl print:rounded-none print:p-0 print:shadow-none">
      <header className="text-center">
        <div className="text-sm uppercase tracking-wide text-zinc-600">{orgName}</div>
        <h1 className="mt-3 text-xl font-bold">{signature}</h1>
        {dateStr && <div className="mt-1 text-sm text-zinc-600">{t.dateWord} {dateStr}</div>}
        {title && <h2 className="mt-4 text-base font-semibold">{t.inCase} {title}</h2>}
      </header>

      {legalBasis && <p className="mt-6 text-sm italic text-zinc-700">{legalBasis}</p>}

      <div className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed">{body}</div>

      <div className="mt-16 text-right">
        <div className="inline-block text-center">
          <div className="h-px w-56 bg-zinc-400" />
          <div className="mt-1 text-sm text-zinc-700">{signer ?? t.signer}</div>
        </div>
      </div>
    </article>
  );
}
