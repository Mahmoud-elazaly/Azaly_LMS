'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import Markdown, { type Components } from 'react-markdown';
import type { Locale } from '@/i18n/locales';

const diagramCopy = {
  en: { title: 'Lesson diagram', viewport: 'Diagram canvas. Use arrow keys or drag to pan.',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset view', loading: 'Rendering diagram…',
    invalid: 'This diagram could not be rendered.', source: 'Diagram source' },
  ar: { title: 'مخطط الدرس', viewport: 'مساحة المخطط. حرّك العرض بالسحب أو بمفاتيح الأسهم.',
    zoomIn: 'تكبير', zoomOut: 'تصغير', reset: 'إعادة ضبط العرض', loading: 'جارٍ عرض المخطط…',
    invalid: 'تعذر عرض هذا المخطط.', source: 'شفرة المخطط' },
};

function observeColorScheme(update: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  media.addEventListener('change', update);
  return () => { observer.disconnect(); media.removeEventListener('change', update); };
}

let renderQueue: Promise<unknown> = Promise.resolve();
function renderDiagram(id: string, source: string, dark: boolean) {
  const next = renderQueue.then(async () => {
    if (source.length > 12000 || /^\s*---(?:\s|$)/.test(source) || /%%\s*\{/.test(source)) {
      throw new Error('Diagram configuration directives are disabled');
    }
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', htmlLabels: false, suppressErrorRendering: true,
      maxTextSize: 12000, maxEdges: 100, theme: dark ? 'dark' : 'neutral',
    });
    const { svg } = await mermaid.render(id, source);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  renderQueue = next.catch(() => undefined);
  return next;
}

function Diagram({ source, locale }: { source: string; locale: Locale }) {
  const labels = diagramCopy[locale];
  const id = `lesson-diagram-${useId().replace(/[^\w-]/g, '')}`;
  const dark = useSyncExternalStore(observeColorScheme,
    () => getComputedStyle(document.documentElement).colorScheme === 'dark', () => false);
  const [rendered, setRendered] = useState<{ source: string; dark: boolean; image: string | null }>();
  const [zoom, setZoom] = useState(100);
  const viewport = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    let active = true;
    void renderDiagram(id, source, dark).then(
      (image) => { if (active) setRendered({ source, dark, image }); },
      () => { if (active) setRendered({ source, dark, image: null }); },
    );
    return () => { active = false; };
  }, [dark, id, source]);

  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target !== event.currentTarget) return;
    const element = event.currentTarget;
    dragging.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    element.setPointerCapture(event.pointerId);
  }

  function pan(event: PointerEvent<HTMLDivElement>) {
    const start = dragging.current;
    if (start) event.currentTarget.scrollTo(start.left + start.x - event.clientX, start.top + start.y - event.clientY);
  }

  const current = rendered?.source === source && rendered.dark === dark ? rendered : undefined;
  if (!current) return <p role="status">{labels.loading}</p>;
  if (current.image === null) return <div className="notice diagram-fallback">
    <p role="status">{labels.invalid}</p>
    <pre dir="ltr" translate="no" tabIndex={0} role="group" aria-label={labels.source}><code>{source}</code></pre>
  </div>;

  return <figure className="lesson-diagram" aria-label={labels.title}>
    <div className="builder-controls">
      <button type="button" className="identity-button" disabled={zoom <= 50} onClick={() => setZoom(zoom - 25)}>{labels.zoomOut}</button>
      <button type="button" className="identity-button" disabled={zoom >= 250} onClick={() => setZoom(zoom + 25)}>{labels.zoomIn}</button>
      <button type="button" className="identity-button" onClick={() => { setZoom(100); viewport.current?.scrollTo(0, 0); }}>{labels.reset}</button>
    </div>
    <div className="diagram-viewport" dir="ltr" tabIndex={0} role="group" aria-label={labels.viewport} ref={viewport}
      onPointerDown={beginPan} onPointerMove={pan} onLostPointerCapture={() => { dragging.current = null; }}>
      {/* Rendering the generated SVG as an image keeps its markup out of the page DOM. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current.image} alt={labels.title} draggable={false} style={{ width: `${zoom}%` }} />
    </div>
  </figure>;
}

export function LessonMarkdown({ source, locale, codeLabel }: { source: string; locale: Locale; codeLabel: string }) {
  const components = useMemo<Components>(() => ({
    pre({ node, children }) {
      const code = node?.children[0];
      if (code?.type === 'element' && code.tagName === 'code' &&
          Array.isArray(code.properties.className) && code.properties.className.includes('language-mermaid')) {
        return <Diagram locale={locale} source={code.children.map((child) => child.type === 'text' ? child.value : '').join('')} />;
      }
      return <pre dir="ltr" translate="no" tabIndex={0} role="group" aria-label={codeLabel}>{children}</pre>;
    },
    code({ children, className }) {
      return <code className={className} dir="ltr" translate="no">{children}</code>;
    },
  }), [locale, codeLabel]);

  return <div className="lesson-markdown"><Markdown skipHtml disallowedElements={['img']} components={components}>
    {source}
  </Markdown></div>;
}
