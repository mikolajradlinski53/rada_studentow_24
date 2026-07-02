export type AiTask = 'polish' | 'format_resolution' | 'translate_en';

/** Calls the self-hosted LLM assistant. Returns transformed text or an error. */
export async function runAi(task: AiTask, text: string): Promise<{ text?: string; error?: string }> {
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, text }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Błąd asystenta AI.' };
    return { text: data.text as string };
  } catch {
    return { error: 'Błąd sieci przy wywołaniu AI.' };
  }
}
