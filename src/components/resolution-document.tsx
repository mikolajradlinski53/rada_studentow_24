import { DocumentPaper } from './document-paper';

/** Presentational uchwała document (paper, printable as A4). Shared by the
 *  authenticated print view and the public registry. Language-agnostic: the
 *  caller passes the fields for the selected language (PL or EN). */
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
    ? { inCase: 'on', signer: 'Chair', dateWord: 'of', footer: 'Document generated in RadaStudentów24' }
    : { inCase: 'w sprawie', signer: 'Przewodniczący', dateWord: 'z dnia', footer: 'Dokument wygenerowany w systemie RadaStudentów24' };

  return (
    <DocumentPaper footer={t.footer}>
      <header className="text-center">
        <div className="font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-600">{orgName}</div>
        <div className="mx-auto mt-4 h-px w-16 bg-zinc-300" />
        <h1 className="mt-5 text-[22px] font-bold leading-tight">{signature}</h1>
        {dateStr && <div className="mt-1.5 text-[15px] text-zinc-600">{t.dateWord} {dateStr}</div>}
        {title && <h2 className="mx-auto mt-5 max-w-[52ch] text-[17px] font-semibold leading-snug">{t.inCase} {title}</h2>}
      </header>

      {legalBasis && <p className="mt-8 text-justify text-[15px] italic leading-relaxed text-zinc-700">{legalBasis}</p>}

      <div className="mt-8 space-y-3 text-[15.5px] leading-[1.7]">
        {body.split(/\n{2,}/).map((block, i) => {
          const text = block.trim();
          if (!text) return null;
          // "§ 1" on its own line is a heading in Polish legal style - centred, bold.
          if (/^§\s*\d+[a-z]?\.?$/i.test(text)) {
            return <p key={i} className="pt-3 text-center font-bold">{text}</p>;
          }
          return <p key={i} className="whitespace-pre-wrap text-justify [hyphens:auto]" lang={lang}>{text}</p>;
        })}
      </div>

      <div className="mt-20 flex justify-end break-inside-avoid">
        <div className="w-64 text-center">
          <div className="h-px bg-zinc-400" />
          <div className="mt-2 text-[15px] font-semibold">{signer ?? ' '}</div>
          <div className="text-[13px] text-zinc-600">{t.signer}</div>
        </div>
      </div>

    </DocumentPaper>
  );
}
