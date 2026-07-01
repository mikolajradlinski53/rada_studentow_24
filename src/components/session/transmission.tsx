'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { youtubeId, youtubeEmbedUrl } from '@/lib/youtube';

/** Read-only embedded player (used on live page + public transmission). */
export function YoutubeEmbed({ url }: { url: string }) {
  const id = youtubeId(url);
  if (!id) return null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-black">
      <iframe
        className="h-full w-full"
        src={youtubeEmbedUrl(id)}
        title="Transmisja"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

/** Live-panel transmission block: shows the stream; chair can set/clear the URL. */
export function Transmission({ org, sessionId, streamUrl, isChair }: { org: string; sessionId: string; streamUrl: string | null; isChair: boolean }) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(streamUrl ?? '');
  const [busy, setBusy] = useState(false);

  const save = async (value: string | null) => {
    setBusy(true);
    await supabase.from('sessions').update({ stream_url: value }).eq('id', sessionId);
    setBusy(false); setEditing(false);
  };

  if (!streamUrl && !isChair) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-400">Transmisja</h2>
        <div className="flex items-center gap-3">
          {streamUrl && (
            <a href={`/${org}/transmisja/${sessionId}`} target="_blank" rel="noopener"
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Publiczny link ↗</a>
          )}
          {isChair && (
            <button onClick={() => setEditing((v) => !v)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              {streamUrl ? 'Zmień' : 'Ustaw transmisję'}
            </button>
          )}
        </div>
      </div>

      {streamUrl && youtubeId(streamUrl) && <YoutubeEmbed url={streamUrl} />}
      {streamUrl && !youtubeId(streamUrl) && (
        <p className="text-xs text-amber-400">Nie rozpoznano linku YouTube.</p>
      )}

      {isChair && editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=… lub /live/…"
            className="min-w-48 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none" />
          <button onClick={() => save(url.trim() || null)} disabled={busy}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">Zapisz</button>
          {streamUrl && (
            <button onClick={() => { setUrl(''); save(null); }} disabled={busy}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Usuń</button>
          )}
        </div>
      )}
    </div>
  );
}
