import type { ReactNode } from 'react';

const symbols = {
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeOff: <><path d="m3 3 18 18M10 6.2a12 12 0 0 1 2-.2c6.5 0 10 6 10 6a15 15 0 0 1-3 3.3m-3.5 2A11 11 0 0 1 12 18C5.5 18 2 12 2 12a15 15 0 0 1 4-4" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  users: <><path d="M3 20v-2a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v2m2-6a4 4 0 0 1 3 4v2m-4-16a4 4 0 0 1 0 7" /><circle cx="9.5" cy="7.5" r="3.5" /></>,
  book: <path d="M12 6c-3-2-5-2-9-2v15c4 0 6 0 9 2 3-2 5-2 9-2V4c-4 0-6 0-9 2Zm0 0v15" />,
  connections: <><path d="m7 7 10 3m-10-3 4 11m6-8-6 8" /><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="10" r="2.5" /><circle cx="11" cy="19" r="2.5" /></>,
  chart: <path d="M4 4v16h16M8 16v-4m5 4V8m5 8V5" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></>,
  home: <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm6 11v-7h6v7" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3m6 0h4" /></>,
} satisfies Record<string, ReactNode>;

export function AccountIcon({ name }: { name: keyof typeof symbols }) {
  return <svg className="account-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{symbols[name]}</svg>;
}
