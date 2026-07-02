'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';

export async function updateProfile(slug: string, fullName: string): Promise<{ ok?: true; error?: string }> {
  if (!fullName.trim()) return { error: 'Imię i nazwisko nie może być puste' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Brak sesji' };

  const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath(`/${slug}`, 'layout');
  return { ok: true };
}
