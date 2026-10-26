import { Source_Serif_4 } from 'next/font/google';

// Official-document typography: a book serif reads as "akt prawny", unlike the
// app's UI sans. Loaded only where documents render.
const serif = Source_Serif_4({ subsets: ['latin', 'latin-ext'], display: 'swap' });

/** A4 paper sheet on screen, plain page in print (see @page in globals.css). */
export function DocumentPaper({ children, footer }: { children: React.ReactNode; footer?: string }) {
  return (
    <article
      className={`theme-fixed ${serif.className} mx-auto w-full max-w-[210mm] rounded-2xl bg-white px-6 py-10 text-[#1c1c1f] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_40px_rgba(0,0,0,0.18)] sm:px-[18mm] sm:py-[20mm] print:max-w-none print:rounded-none print:p-0 print:shadow-none`}
    >
      {children}
      {footer && (
        <footer className="mt-16 border-t border-zinc-200 pt-3 text-center font-sans text-[10px] tracking-wide text-zinc-400">
          {footer}
        </footer>
      )}
    </article>
  );
}
