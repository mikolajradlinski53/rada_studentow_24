'use client';

import { useState, useSyncExternalStore } from 'react';
import { clsx } from 'clsx';
import { Monitor, Moon, Sun } from 'lucide-react';
import { subscribeNoop } from '@/lib/push-client';
import { THEME_KEY, applyTheme } from '@/lib/theme';

type Choice = 'system' | 'light' | 'dark';

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const OPTIONS: { value: Choice; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Systemowy', Icon: Monitor },
  { value: 'light', label: 'Jasny', Icon: Sun },
  { value: 'dark', label: 'Ciemny', Icon: Moon },
];

export function ThemePicker() {
  const stored = useSyncExternalStore(subscribeNoop, readChoice, () => 'system' as Choice);
  const [choice, setChoice] = useState<Choice | null>(null);
  const current = choice ?? stored;

  const pick = (c: Choice) => { setChoice(c); applyTheme(c); };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="text-sm font-medium text-zinc-100">Wygląd</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">„Systemowy” przełącza się razem z telefonem (np. ciemny wieczorem).</p>
      <div role="radiogroup" aria-label="Motyw" className="mt-3 grid grid-cols-3 rounded-xl bg-zinc-950/60 p-1 ring-1 ring-zinc-800">
        {OPTIONS.map(({ value, label, Icon }) => (
          <button key={value} role="radio" aria-checked={current === value} onClick={() => pick(value)}
            className={clsx('flex h-10 items-center justify-center gap-1.5 rounded-lg text-[14px] font-medium transition-colors',
              current === value ? 'bg-zinc-700/80 text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
