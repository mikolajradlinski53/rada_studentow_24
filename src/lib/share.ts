'use client';

/** Native share sheet on phones (WhatsApp, Messenger, SMS…), clipboard elsewhere. */
export async function shareOrCopy(text: string, title?: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (typeof navigator !== 'undefined' && navigator.share && navigator.maxTouchPoints > 0) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // fall through to clipboard
    }
  }
  await copyText(text);
  return 'copied';
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older iOS / insecure context fallback.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
