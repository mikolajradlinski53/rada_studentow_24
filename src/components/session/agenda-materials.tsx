'use client';

import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { File, FileImage, FileSpreadsheet, FileText, Loader2, Paperclip, Presentation, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AgendaAttachment } from '@/types/database';

const BUCKET = 'materials';
const MAX_BYTES = 50 * 1024 * 1024; // matches the bucket limit (migration 017)

function iconFor(type: string | null, name: string) {
  const t = (type ?? '').toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (t.startsWith('image/')) return FileImage;
  if (t.includes('sheet') || t.includes('excel') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return FileSpreadsheet;
  if (t.includes('presentation') || ['ppt', 'pptx', 'odp', 'key'].includes(ext)) return Presentation;
  if (t.includes('pdf') || t.includes('word') || t.startsWith('text/') || ['pdf', 'doc', 'docx', 'odt', 'txt', 'rtf'].includes(ext)) return FileText;
  return File;
}

function humanSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Storage keys allow only a safe ASCII subset; the real name lives in the DB row. */
function safeKey(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120);
}

/**
 * Materials attached to one agenda item. Everyone in the org can open them
 * (short-lived signed URLs); the session's chair/admin can add and remove.
 */
export function AgendaMaterials({
  itemId, sessionId, orgId, canEdit, initial,
}: {
  itemId: string;
  sessionId: string;
  orgId?: string;
  canEdit: boolean;
  initial?: AgendaAttachment[];
}) {
  const [files, setFiles] = useState<AgendaAttachment[]>(initial ?? []);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initial) return;
    createClient().from('agenda_attachments').select('*').eq('agenda_item_id', itemId).order('created_at')
      .then(({ data }) => setFiles((data as AgendaAttachment[]) ?? []));
  }, [itemId, initial]);

  // Signed links are prepared up-front (1 h) so taps are plain <a> links:
  // reliable in the installed iOS app, where async window.open is blocked.
  const [links, setLinks] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = files.filter((f) => !links[f.file_url]).map((f) => f.file_url);
    if (!missing.length) return;
    createClient().storage.from(BUCKET).createSignedUrls(missing, 3600).then(({ data }) => {
      if (!data) return;
      setLinks((cur) => {
        const next = { ...cur };
        for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
        return next;
      });
    });
  }, [files, links]);

  const upload = async (list: FileList) => {
    if (!orgId) return;
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) { setError(`„${file.name}” ma ponad 50 MB.`); continue; }
      setUploading(file.name);
      const path = `${orgId}/${sessionId}/${itemId}/${crypto.randomUUID().slice(0, 8)}-${safeKey(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined, upsert: false,
      });
      if (upErr) { setError(`Nie udało się wgrać „${file.name}”.`); continue; }
      const { data: row, error: rowErr } = await supabase.from('agenda_attachments').insert({
        agenda_item_id: itemId, file_name: file.name, file_url: path,
        file_type: file.type || null, file_size: file.size, uploaded_by: user?.id ?? null,
      }).select().single();
      if (rowErr || !row) {
        await supabase.storage.from(BUCKET).remove([path]);
        setError(`Nie udało się zapisać „${file.name}”.`);
        continue;
      }
      setFiles((cur) => [...cur, row as AgendaAttachment]);
    }
    setUploading(null);
  };

  const remove = async (f: AgendaAttachment) => {
    if (!confirm(`Usunąć „${f.file_name}”?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('agenda_attachments').delete().eq('id', f.id);
    if (error) { setError('Nie udało się usunąć pliku.'); return; }
    await supabase.storage.from(BUCKET).remove([f.file_url]);
    setFiles((cur) => cur.filter((x) => x.id !== f.id));
  };

  if (!files.length && !canEdit) return null;

  return (
    <div className="mt-2.5 space-y-1.5">
      {files.map((f) => {
        const Icon = iconFor(f.file_type, f.file_name);
        return (
          <div key={f.id} className="flex items-center gap-1 rounded-xl bg-zinc-800/50 ring-1 ring-zinc-800">
            <a href={links[f.file_url] ?? '#'} target="_blank" rel="noopener noreferrer"
              aria-disabled={!links[f.file_url]}
              className={clsx('press flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 pl-3 pr-2 text-left hover:bg-zinc-800/60',
                !links[f.file_url] && 'pointer-events-none opacity-60')}>
              <Icon className="h-4 w-4 shrink-0 text-indigo-300" />
              <span className="min-w-0 flex-1 truncate text-[14px] text-zinc-200">{f.file_name}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-zinc-500">{humanSize(f.file_size)}</span>
            </a>
            {canEdit && (
              <button onClick={() => remove(f)} aria-label={`Usuń ${f.file_name}`}
                className="press mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-950/30 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}

      {canEdit && orgId && (
        <>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
          <button onClick={() => inputRef.current?.click()} disabled={!!uploading}
            className={clsx('press flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-indigo-300 hover:bg-indigo-950/40 disabled:opacity-60')}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            <span className="max-w-[16rem] truncate">{uploading ? `Wgrywanie: ${uploading}` : 'Dodaj materiał'}</span>
          </button>
        </>
      )}
      {error && <p role="alert" className="px-1 text-[13px] text-red-400">{error}</p>}
    </div>
  );
}
