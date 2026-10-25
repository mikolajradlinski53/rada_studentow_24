import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Batch transcription via a SELF-HOSTED Whisper server (OpenAI-compatible, e.g.
// faster-whisper-server / speaches / whisper.cpp server). One server serves all
// tenants — flat infra cost, no per-minute API fees. Configure with:
//   WHISPER_API_URL   full transcriptions endpoint, e.g.
//                     https://whisper.twoj-serwer.pl/v1/audio/transcriptions
//   WHISPER_API_TOKEN (optional) bearer token if the server is protected
//   WHISPER_MODEL     (optional) model name, default "whisper-1"
// Note: audio flows browser → this route → Whisper server. Vercel caps request
// bodies at ~4.5 MB, so upload short/compressed clips (split long recordings).
// See docs/whisper-selfhost.md.
export async function POST(request: Request) {
  const url = process.env.WHISPER_API_URL;
  if (!url) {
    return NextResponse.json(
      { error: 'Transkrypcja niedostępna, administrator nie ustawił WHISPER_API_URL.' },
      { status: 501 }
    );
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Brak pliku audio.' }, { status: 400 });
  }
  if (file.size > 24 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'Plik za duży. Podziel nagranie na krótsze fragmenty.' },
      { status: 413 }
    );
  }

  const wForm = new FormData();
  wForm.append('file', file, (file as File).name || 'audio.webm');
  wForm.append('model', process.env.WHISPER_MODEL || 'whisper-1');
  wForm.append('language', 'pl');
  wForm.append('response_format', 'text');

  const headers: Record<string, string> = {};
  if (process.env.WHISPER_API_TOKEN) headers.Authorization = `Bearer ${process.env.WHISPER_API_TOKEN}`;

  let resp: Response;
  try {
    resp = await fetch(url, { method: 'POST', headers, body: wForm });
  } catch {
    return NextResponse.json({ error: 'Nie udało się połączyć z serwerem transkrypcji.' }, { status: 502 });
  }

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    return NextResponse.json({ error: `Błąd transkrypcji (${resp.status}). ${detail}` }, { status: 502 });
  }

  const text = await resp.text();
  return NextResponse.json({ text });
}
