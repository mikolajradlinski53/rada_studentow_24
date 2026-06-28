'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { clsx } from 'clsx';
import type { AgendaItem, AgendaItemType } from '@/types/database';

const ITEM_TYPE_LABELS: Record<AgendaItemType, string> = {
  procedural: 'Proceduralne',
  discussion: 'Dyskusja',
  resolution: 'Uchwała',
  election: 'Wybory',
  information: 'Informacja',
};

const ITEM_TYPE_COLORS: Record<AgendaItemType, string> = {
  procedural: 'text-zinc-500',
  discussion: 'text-blue-400',
  resolution: 'text-indigo-400',
  election: 'text-amber-400',
  information: 'text-zinc-400',
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

    const supabase = createClient();
    const { data, error } = await supabase
      .from('agenda_items')
      .insert({
        session_id: sessionId,
        position: items.length + 1,
        title: newTitle.trim(),
        item_type: newType,
      })
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

  const handleRemove = async (itemId: string) => {
    if (!confirm('Usunąć punkt z porządku?')) return;

    const supabase = createClient();
    await supabase.from('agenda_items').delete().eq('id', itemId);
    setItems(items.filter((i) => i.id !== itemId));
  };

  if (!items.length && !canEdit) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-zinc-500">
        Porządek obrad nie został jeszcze ustalony.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 group"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-medium bg-zinc-800 text-zinc-400">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-200">{item.title}</div>
            <div className={clsx('mt-0.5 text-xs', ITEM_TYPE_COLORS[item.item_type as AgendaItemType])}>
              {ITEM_TYPE_LABELS[item.item_type as AgendaItemType]}
            </div>
          </div>
          {canEdit && (
            <button
              onClick={() => handleRemove(item.id)}
              className="shrink-0 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
            >
              Usuń
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <>
          {showForm ? (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Tytuł punktu porządku obrad"
                autoFocus
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(ITEM_TYPE_LABELS) as [AgendaItemType, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setNewType(value)}
                    className={clsx(
                      'rounded-full px-2.5 py-1 text-xs transition-colors',
                      newType === value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={saving || !newTitle.trim()}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  Dodaj
                </button>
                <button
                  onClick={() => { setShowForm(false); setNewTitle(''); }}
                  className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Anuluj
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full rounded-lg border border-dashed border-zinc-800 py-3 text-sm text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-colors"
            >
              + Dodaj punkt
            </button>
          )}
        </>
      )}
    </div>
  );
}
