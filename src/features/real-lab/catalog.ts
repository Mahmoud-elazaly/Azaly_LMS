import type { Locale } from '../../i18n/locales';
import templates from './templates.json';

export type LabTemplateVersion = keyof typeof templates;
export const templateVersions = Object.keys(templates) as LabTemplateVersion[];
export const templateVersion = 'nginx-reverse-proxy@1';
export const starterDirective = templates[templateVersion].configurations.green;
export const labTemplates = templates;

export function isLabTemplateVersion(value: unknown): value is LabTemplateVersion {
  return typeof value === 'string' && Object.hasOwn(templates, value);
}

export function realLabHref(locale: Locale, version: LabTemplateVersion) {
  const base = `/${locale}/real-lab`;
  return version === templateVersion ? base : `${base}?template=${encodeURIComponent(version)}`;
}

export function parseProxyDirective(configuration: string) {
  if (configuration.length > 96) return null;
  const port = /^proxy_pass[ \t]+http:\/\/127\.0\.0\.1:(8081|8082)[ \t]*;$/.exec(configuration.trim())?.[1];
  return port === '8081' ? 'blue' : port === '8082' ? 'green' : null;
}

export function parseLabConfiguration(configuration: string, version?: LabTemplateVersion) {
  if (configuration.length > 96) return null;
  for (const candidate of version ? [version] : templateVersions) {
    const choice = candidate === templateVersion
      ? parseProxyDirective(configuration)
      : Object.entries(templates[candidate].configurations).find(([, value]) => value === configuration.trim())?.[0];
    if (choice) return { version: candidate, choice };
  }
  return null;
}

export function starterConfiguration(version: LabTemplateVersion) {
  const template = templates[version];
  return Object.entries(template.configurations).find(([choice]) => choice === template.starter)![1];
}
