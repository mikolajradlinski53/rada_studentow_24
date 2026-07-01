/** Extracts an 11-char YouTube video id from common URL shapes; null if none. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,        // watch?v=ID
    /youtu\.be\/([A-Za-z0-9_-]{11})/,   // youtu.be/ID
    /\/live\/([A-Za-z0-9_-]{11})/,      // /live/ID
    /\/embed\/([A-Za-z0-9_-]{11})/,     // /embed/ID
    /\/shorts\/([A-Za-z0-9_-]{11})/,    // /shorts/ID
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}
