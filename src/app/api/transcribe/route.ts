import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Batch transcription via OpenAI Whisper (whisper-1). The protokolant uploads a
// recording after the sitting; the text is appended to the protocol draft.
// Requires OPENAI_API_KEY. Large meetings should be split into <24 MB clips
// (OpenAI limit is 25 MB; per-agenda-item recordings work well). Live captions
// and Storage-backed large uploads are future work.
export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'Transkrypcja niedostępna — administrator nie ustawił OPENAI_API_KEY.' },
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
      { error: 'Plik za duży (max ~24 MB). Podziel nagranie na krótsze fragmenty.' },
      { status: 413 }
    );
  }

  const oaForm = new FormData();
  oaForm.append('file', file, (file as File).name || 'audio.webm');
  oaForm.append('model', 'whisper-1');
  oaForm.append('language', 'pl');
  oaForm.append('response_format', 'text');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: oaForm,
  });

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    return NextResponse.json({ error: `Błąd transkrypcji (${resp.status}). ${detail}` }, { status: 502 });
  }

  const text = await resp.text(); // response_format=text → plain text
  return NextResponse.json({ text });
}
