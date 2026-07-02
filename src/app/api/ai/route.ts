import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Content assistant via a SELF-HOSTED LLM (Ollama or any OpenAI-compatible server).
// One server for all tenants — flat cost, no per-token fees, data stays private.
//   LLM_API_URL   OpenAI-compatible chat endpoint, e.g.
//                 http://host:11434/v1/chat/completions (Ollama)
//   LLM_MODEL     model name, e.g. "bielik", "llama3.1", "qwen2.5" (default llama3.1)
//   LLM_API_TOKEN (optional) bearer token if the server is protected
// The LLM is an ASSISTANT — output is a draft for human review, not final.
const PROMPTS: Record<string, string> = {
  polish:
    'Jesteś doświadczonym protokolantem organu kolegialnego. Przekształć poniższe surowe ' +
    'notatki lub szkielet w schludny, formalny protokół po polsku. Zachowaj WSZYSTKIE fakty, ' +
    'liczby, wyniki głosowań, nazwiska i daty. Nie dodawaj informacji, których nie ma w tekście. ' +
    'Zwróć wyłącznie treść protokołu, bez komentarzy od siebie.',
  format_resolution:
    'Jesteś legislatorem. Sformatuj poniższą treść jako formalną uchwałę w urzędowym języku ' +
    'polskim, ze strukturą paragrafów (§ 1, § 2, …). Nie zmieniaj znaczenia ani ustaleń. ' +
    'Zwróć wyłącznie treść uchwały, bez komentarzy.',
  translate_en:
    'You are a professional legal translator. Translate the following Polish text into formal, ' +
    'official English, preserving meaning and structure. Return only the translation, no comments.',
};

export async function POST(request: Request) {
  const url = process.env.LLM_API_URL;
  if (!url) {
    return NextResponse.json({ error: 'Asystent AI niedostępny — administrator nie ustawił LLM_API_URL.' }, { status: 501 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });

  const { task, text } = await request.json().catch(() => ({}));
  const system = PROMPTS[task as string];
  if (!system || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Niepoprawne dane wejściowe.' }, { status: 400 });
  }
  if (text.length > 40000) {
    return NextResponse.json({ error: 'Tekst za długi — podziel na fragmenty.' }, { status: 413 });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.LLM_API_TOKEN) headers.Authorization = `Bearer ${process.env.LLM_API_TOKEN}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'llama3.1',
        messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
        temperature: 0.2,
        stream: false,
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Nie udało się połączyć z serwerem AI.' }, { status: 502 });
  }

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    return NextResponse.json({ error: `Błąd AI (${resp.status}). ${detail}` }, { status: 502 });
  }

  const data = await resp.json().catch(() => null);
  const out = data?.choices?.[0]?.message?.content;
  if (typeof out !== 'string') {
    return NextResponse.json({ error: 'Serwer AI zwrócił nieoczekiwaną odpowiedź.' }, { status: 502 });
  }
  return NextResponse.json({ text: out.trim() });
}
