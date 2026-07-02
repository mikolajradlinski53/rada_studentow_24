export type AiTask = 'polish' | 'format_resolution' | 'translate_en';

/** Streams the self-hosted LLM. Calls onDelta with each text chunk as it arrives
 *  (live "typing" effect); resolves with the full text or an error. */
export async function runAiStream(
  task: AiTask,
  text: string,
  onDelta: (chunk: string) => void
): Promise<{ text?: string; error?: string }> {
  let res: Response;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, text }),
    });
  } catch {
    return { error: 'Błąd sieci przy wywołaniu AI.' };
  }

  // Errors (501/401/400/502) come back as JSON, not a stream.
  if (!res.ok || res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json().catch(() => ({}));
    return { error: data.error ?? `Błąd asystenta AI (${res.status}).` };
  }
  if (!res.body) return { error: 'Brak odpowiedzi z serwera AI.' };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      full += chunk;
      onDelta(chunk);
    }
  } catch {
    return { error: 'Połączenie z AI zostało przerwane.' };
  }
  return { text: full };
}

/** Non-streaming convenience wrapper (awaits the full text). */
export async function runAi(task: AiTask, text: string): Promise<{ text?: string; error?: string }> {
  return runAiStream(task, text, () => {});
}
