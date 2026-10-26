import { Fragment } from 'react';

/** Inline: **bold**, _italic_ (the subset the protocol generator emits). */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('_') && p.endsWith('_') && p.length > 2) return <em key={i} className="text-zinc-600">{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/**
 * Minimal Markdown -> document renderer for protocols: #/##/### headings,
 * "- " lists, paragraphs, hard line breaks. Deliberately tiny (no HTML pass-
 * through, so user text can't inject markup).
 */
export function MarkdownDoc({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(
      <p key={blocks.length} className="text-justify">
        {para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l.replace(/\s+$/, ''))}</Fragment>)}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc space-y-0.5 pl-6">
        {list.map((l, i) => <li key={i}>{inline(l)}</li>)}
      </ul>
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      blocks.push(
        level === 1 ? <h1 key={blocks.length} className="text-center text-[22px] font-bold">{inline(h[2])}</h1>
          : level === 2 ? <h2 key={blocks.length} className="pt-4 text-[17px] font-bold">{inline(h[2])}</h2>
          : <h3 key={blocks.length} className="pt-2 text-[15.5px] font-semibold">{inline(h[2])}</h3>
      );
    } else if (/^-\s+/.test(line)) {
      flushPara();
      list.push(line.replace(/^-\s+/, ''));
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();

  return <div className="space-y-3 text-[15px] leading-[1.65]">{blocks}</div>;
}
