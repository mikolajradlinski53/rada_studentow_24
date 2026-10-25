'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

/**
 * iOS-style bottom sheet on phones, centered dialog from `sm` up.
 * Enters with @starting-style (Tailwind `starting:`), closes on scrim tap,
 * Escape, or the close button. Locks page scroll while open.
 */
export function Sheet({
  open, onClose, title, description, children, className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'pb-safe relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[22px] border border-zinc-800 bg-zinc-900 shadow-2xl outline-none',
          'transition-[transform,opacity] duration-300 ease-[var(--ease-drawer)] starting:translate-y-full',
          'sm:max-w-md sm:rounded-2xl sm:starting:translate-y-0 sm:starting:scale-95 sm:starting:opacity-0',
          className
        )}
      >
        {/* Grabber (visual affordance on phones) */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <div className="h-1 w-9 rounded-full bg-zinc-700" />
        </div>
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold tracking-tight text-zinc-50">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] leading-snug text-zinc-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Zamknij"
            className="press -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>,
    document.body
  );
}
