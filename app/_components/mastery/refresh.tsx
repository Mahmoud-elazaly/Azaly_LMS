'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { masteryCopy } from '@/features/mastery/copy';
import type { Locale } from '@/i18n/locales';

export function RefreshMastery({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = masteryCopy(locale);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    function refreshRestoredPage(event: PageTransitionEvent) {
      if (event.persisted) router.refresh();
    }
    window.addEventListener('pageshow', refreshRestoredPage);
    return () => window.removeEventListener('pageshow', refreshRestoredPage);
  }, [router]);
  return <button type="button" aria-live="polite" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
    {pending ? t.refreshing : t.refresh}
  </button>;
}
