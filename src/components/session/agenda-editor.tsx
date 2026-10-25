'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AgendaItem, AgendaItemType } from '@/types/database';

const ITEM_TYPE_LABELS: Record<AgendaItemType, string> = {
  procedural: 'Proceduralne',
  discussion: 'Dyskusja',
  resolution: 'Uchwała',
  election: 'Wybory',
  information: 'Informacja',
};

const ITEM_TYPE_TONE: Record<AgendaItemType, string> = {
  procedural: 'bg-zinc-800 text-zinc-400',
  discussion: 'bg-sky-900/40 text-sky-300',
  resolution: 'bg-indigo-900/40 text-indigo-300',
  election: 'bg-amber-900/40 text-amber-300',
  information: 'bg-zinc-800 text-zinc-400',
};

interface AgendaEditorProps {
  sessionId: string;
  initialItems: AgendaItem[];
  canEdit: boolean;
}

export function AgendaEditor({ sessionId, initialItems, canEdit }: AgendaEditorProps) {
  const [items, setItems] = useState<AgendaItem[]>(initialItems);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<AgendaItemType>('discussion');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    const { data, error } = await createClient()
      .from('agenda_items')
      .insert({ session_id: sessionId, position: items.length + 1, title: newTitle.trim(), item_type: newType })
      .select()
      .single();
    if (data && !error) {
      setItems([...items, data]);
      setNewTitle('');
      setNewType('discussion');
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleRemove = async (item: AgendaItem) => {
    if (!confirm(`Usunąć punkt „${item.title}” z porządku obrad?`)) return;
    await createClient().from('agenda_items').delete().eq('id', item.id);
    setItems(items.filter((i) => i.id !== item.id));
  };

  if (!items.length && !canEdit) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-10 text-center">
        <ListPlus className="mx-auto h-7 w-7 text-zinc-600" />
        <p className="mt-3 text-[15px] text-zinc-300">Porządek obrad nie jest jeszcze ustalony</p>
        <p className="mt-1 text-[13px] text-zinc-500">Pojawi się tutaj, gdy prowadzący go przygotuje.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
      {items.map((item, idx) => (
        <div key={item.id} className={clsx('flex items-start gap-3 px-4 py-3.5', idx > 0 && 'border-t border-zinc-800/80')}>
          <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[12px] font-semibold tabular-nums text-zinc-300">
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] leading-snug text-zinc-100">{item.title}</div>
            {item.description && <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{item.description}</p>}
            <span className={clsx('mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', ITEM_TYPE_TONE[item.item_type])}>
              {ITEM_TYPE_LABELS[item.item_type]}
            </span>
          </div>
          {canEdit && (
            <button
              onClick={() => handleRemove(item)}
              aria-label={`Usuń punkt ${idx + 1}`}
              className="press -mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-red-950/30 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        showForm ? (
          <div className={clsx('space-y-3 p-4', items.length > 0 && 'border-t border-zinc-800/80')}>
            <label htmlFor="agenda-title" className="sr-only">Tytuł punktu</label>
            <input
              id="agenda-title"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Tytuł punktu porządku obrad"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 text-[16px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            />
            <div role="radiogroup" aria-label="Rodzaj punktu" className="flex flex-wrap gap-1.5">
              {(Object.entries(ITEM_TYPE_LABELS) as [AgendaItemType, string][]).map(([value, label]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={newType === value}
                  onClick={() => setNewType(value)}
                  className={clsx('press h-9 rounded-full px-3.5 text-[13px] font-medium',
                    newType === value ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-2.5">
              <button
                onClick={() => { setShowForm(false); setNewTitle(''); }}
                className="press h-11 rounded-xl border border-zinc-700 text-[15px] text-zinc-300"
              >
                Anuluj
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !newTitle.trim()}
                className="press h-11 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {saving ? 'Dodawanie…' : 'Dodaj punkt'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className={clsx('press flex h-12 w-full items-center gap-3 px-4 text-[15px] font-medium text-indigo-300 hover:bg-zinc-800/40',
              items.length > 0 && 'border-t border-zinc-800/80')}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            Dodaj punkt
          </button>
        )
      )}
    </div>
  );
}
