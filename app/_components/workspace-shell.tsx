'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Locale } from '@/i18n/locales';
import { AccountIcon } from './account-icon';
import { LocaleSwitch, Navigation, type NavigationGroup } from './navigation';

export function WorkspaceShell({ locale, groups, navigationLabel, language, openLabel, closeLabel, brand, utilities, children }: {
  locale: Locale;
  groups: NavigationGroup[];
  navigationLabel: string;
  language: string;
  openLabel: string;
  closeLabel: string;
  brand: ReactNode;
  utilities: ReactNode;
  children: ReactNode;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    function closeAtDesktop() {
      if (desktop.matches) drawer.current?.close();
    }
    desktop.addEventListener('change', closeAtDesktop);
    return () => desktop.removeEventListener('change', closeAtDesktop);
  }, []);

  function openDrawer() {
    const panel = drawer.current;
    if (!panel || panel.open) return;
    panel.showModal();
    setOpen(true);
  }

  return <div className="workspace-shell">
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar-header">{brand}</div>
      <Navigation locale={locale} label={navigationLabel} groups={groups} />
    </aside>
    <div className="workspace-main">
      <header className="workspace-topbar">
        <div className="container workspace-topbar-inner">
          <div className="workspace-mobile-brand">
            <button type="button" className="workspace-menu" aria-label={openLabel}
              aria-expanded={open} aria-controls="workspace-drawer" onClick={openDrawer}><AccountIcon name="menu" /></button>
            {brand}
          </div>
          <div className="workspace-utilities">
            <LocaleSwitch locale={locale} language={language} />
            {utilities}
          </div>
        </div>
      </header>
      {children}
    </div>
    <dialog ref={drawer} id="workspace-drawer" className="workspace-drawer" aria-label={navigationLabel}
      onClose={() => setOpen(false)} onClick={(event) => {
        if (event.target === event.currentTarget || (event.target instanceof Element && event.target.closest('.brand')
            && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)) event.currentTarget.close();
      }}>
      <div className="workspace-drawer-inner">
        <div className="workspace-sidebar-header">
          <button type="button" className="workspace-menu workspace-drawer-close" aria-label={closeLabel}
            onClick={() => drawer.current?.close()}><AccountIcon name="close" /></button>
          {brand}
        </div>
        <Navigation locale={locale} label={navigationLabel} groups={groups} onNavigate={() => drawer.current?.close()} />
      </div>
    </dialog>
  </div>;
}
