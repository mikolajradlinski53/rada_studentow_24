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
      className="press h-9 shrink-0 rounded-xl bg-indigo-600 px-3.5 text-[13px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
      {isPending ? 'Tworzenie…' : 'Utwórz uchwałę'}
    </button>
  );
}
