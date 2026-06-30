'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function StartSessionButtonClient({ sessionId, org }: { sessionId: string; org: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleStart = async () => {
    if (!confirm('Czy chcesz otworzyć posiedzenie? Radni będą mogli potwierdzać obecność.')) return;

    setLoading(true);
    const supabase = createClient();

    await supabase
      .from('sessions')
      .update({ status: 'in_progress', opened_at: new Date().toISOString() })
      .eq('id', sessionId);
    await supabase.rpc('log_audit', { p_action: 'session.opened', p_target_type: 'session', p_target_id: sessionId, p_metadata: {} });

    router.push(`/${org}/sessions/${sessionId}/live`);
  };

  return (
    <button
      onClick={handleStart}
      disabled={loading}
      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
    >
      {loading ? 'Otwieranie...' : 'Otwórz posiedzenie'}
    </button>
  );
}
