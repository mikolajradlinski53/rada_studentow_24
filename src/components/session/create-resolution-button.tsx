'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createResolutionFromVote } from '@/app/[org]/(dashboard)/resolutions/actions';

export function CreateResolutionButton({ org, voteId }: { org: string; voteId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const create = () => {
    startTransition(async () => {
      const res = await createResolutionFromVote(org, voteId);
      if (res?.error) alert(res.error);
      else if (res?.id) router.push(`/${org}/resolutions/${res.id}`);
    });
  };

  return (
    <button onClick={create} disabled={isPending}
      className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
      {isPending ? 'Tworzenie…' : 'Utwórz uchwałę'}
    </button>
  );
}
