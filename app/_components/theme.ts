export const themes = ['system', 'light', 'dark'] as const;
export type Theme = (typeof themes)[number];

export function parseTheme(value: unknown): Theme {
  return themes.find((theme) => theme === value) ?? 'system';
}
