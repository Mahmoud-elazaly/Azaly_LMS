'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { interviewCopy } from '@/features/interview/copy';
import { masteryCopy } from '@/features/mastery/copy';
import { graphLayout, nodeHeight, nodeWidth } from '@/features/mastery/graph-layout';
import { relations, tracks, type Edge, type MasteryConcept } from '@/features/mastery/model';
import type { Locale } from '@/i18n/locales';
import { masteryFormat, PracticeLink } from './practice';

const statuses = ['notStarted', 'inProgress', 'mastered', 'needsRemediation'] as const;

function graphPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const sy = from.y + nodeHeight / 2;
  const ty = to.y + nodeHeight / 2;
  if (to.x === from.x) {
    const x = from.x + nodeWidth;
    return `M${x} ${sy} C${x + 24} ${sy} ${x + 24} ${ty} ${x} ${ty}`;
  }
  const sx = to.x > from.x ? from.x + nodeWidth : from.x;
  const tx = to.x > from.x ? to.x : to.x + nodeWidth;
  const bend = (sx + tx) / 2;
  return `M${sx} ${sy} C${bend} ${sy} ${bend} ${ty} ${tx} ${ty}`;
}

export function KnowledgeGraph({ concepts, edges, locale, labsEnabled }: {
  concepts: MasteryConcept[]; edges: Edge[]; locale: Locale; labsEnabled: boolean;
}) {
  const t = masteryCopy(locale);
  const search = useSearchParams();
  const track = tracks.find((value) => value === search.get('track')) ?? '';
  const relation = relations.find((value) => value === search.get('relation')) ?? '';
  const viewport = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const arrowId = useId();
  const [zoom, setZoom] = useState(100);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const selected = concepts.find(({ slug }) => slug === search.get('concept'));
  const eligible = new Set(concepts.filter((concept) => !track || concept.track === track).map(({ slug }) => slug));
  const visibleEdges = edges.filter((edge) => (!relation || edge.relation === relation) &&
    (track ? eligible.has(edge.source) || eligible.has(edge.target) : true));
  const adjacent = new Set(visibleEdges.flatMap(({ source, target }) => [source, target]));
  const visible = concepts.filter(({ slug }) => relation ? adjacent.has(slug) : eligible.has(slug) || adjacent.has(slug));
  const { positions, width, height } = graphLayout(visible.map(({ slug }) => slug), visibleEdges);

  useEffect(() => {
    const dialog = drawer.current;
    if (selected && dialog && !dialog.open) dialog.showModal();
    if (!selected && dialog?.open) dialog.close();
  }, [selected]);

  function setQuery(key: 'track' | 'relation' | 'concept', value: string) {
    const query = new URLSearchParams(window.location.search);
    if (value) query.set(key, value);
    else query.delete(key);
    const destination = query.size ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, '', destination);
    if (key !== 'concept') viewport.current?.scrollTo(0, 0);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !(event.target instanceof Element) || event.target.closest('button')) return;
    const canvas = event.currentTarget;
    drag.current = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
    canvas.setPointerCapture(event.pointerId);
  }

  function pan(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (start) event.currentTarget.scrollTo(start.left + start.x - event.clientX, start.top + start.y - event.clientY);
  }

  function keyboardPan(event: KeyboardEvent<HTMLDivElement>) {
    const step = new Map([['ArrowLeft', [-60, 0]], ['ArrowRight', [60, 0]], ['ArrowUp', [0, -60]], ['ArrowDown', [0, 60]]]);
    const delta = step.get(event.key);
    if (event.target !== event.currentTarget || !delta || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.scrollBy(delta[0], delta[1]);
  }

  const percent = masteryFormat(locale);
  const scale = zoom / 100;
  return <section className="mastery-graph" aria-label={t.graph}>
    <div className="mastery-graph-toolbar">
      <label>{t.track}<select value={track} onChange={(event) => setQuery('track', event.target.value)}>
        <option value="">{t.allTracks}</option>
        {tracks.map((value) => <option key={value} value={value}>{t.tracks[value]}</option>)}
      </select></label>
      <label>{t.relation}<select value={relation} onChange={(event) => setQuery('relation', event.target.value)}>
        <option value="">{t.allRelations}</option>
        {relations.map((value) => <option key={value} value={value}>{t.relations[value]}</option>)}
      </select></label>
      <div className="mastery-zoom">
        <button type="button" aria-label={t.zoomOut} disabled={zoom <= 75} onClick={() => setZoom(zoom - 25)}>−</button>
        <bdi aria-live="polite">{percent.format(scale)}</bdi>
        <button type="button" aria-label={t.zoomIn} disabled={zoom >= 175} onClick={() => setZoom(zoom + 25)}>+</button>
        <button type="button" onClick={() => { setZoom(100); viewport.current?.scrollTo(0, 0); }}>{t.reset}</button>
      </div>
    </div>
    <ul className="mastery-legend">{statuses.map((status) => <li data-status={status} key={status}>{t.statuses[status]}</li>)}</ul>
    {visible.length === 0 ? <p role="status" className="mastery-graph-empty">{t.noGraphMatches}</p> : <>
      <div ref={viewport} className="mastery-canvas" dir="ltr" tabIndex={0} role="group" aria-label={t.graphCanvas}
        onPointerDown={startDrag} onPointerMove={pan} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={keyboardPan}>
        <div className="mastery-canvas-size" style={{ width: width * scale, height: height * scale }}>
          <div className="mastery-canvas-layer" style={{ width, height, transform: `scale(${scale})` }}>
            <svg width={width} height={height} aria-hidden="true" className="mastery-edges">
              <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 10 5 0 10Z" />
              </marker></defs>
              {visibleEdges.map((edge) => {
                const from = positions.get(edge.source);
                const to = positions.get(edge.target);
                return from && to && <path key={`${edge.source}/${edge.target}/${edge.relation}`} d={graphPath(from, to)}
                  data-relation={edge.relation} markerEnd={`url(#${arrowId})`} />;
              })}
            </svg>
            {visible.map((concept) => {
              const position = positions.get(concept.slug);
              return position && <button type="button" key={concept.slug} data-status={concept.status} className="mastery-node"
                style={{ left: position.x, top: position.y, width: nodeWidth, minHeight: nodeHeight }}
                dir={locale === 'ar' ? 'rtl' : 'ltr'} onClick={() => setQuery('concept', concept.slug)} aria-haspopup="dialog">
                <bdi>{concept.titles[locale]}</bdi>
                <span>{t.statuses[concept.status]}{concept.score === null ? '' : <> · <bdi>{percent.format(concept.score / 100)}</bdi></>}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
      <details className="mastery-concept-list">
        <summary>{t.conceptList}</summary>
        <ul>{visible.map((concept) => <li key={concept.slug}><button type="button" aria-haspopup="dialog"
          onClick={() => setQuery('concept', concept.slug)}><bdi>{concept.titles[locale]}</bdi></button></li>)}</ul>
      </details>
    </>}
    <dialog ref={drawer} className="mastery-drawer" aria-labelledby="mastery-concept-title"
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      onClose={() => { if (new URLSearchParams(window.location.search).has('concept')) setQuery('concept', ''); }}>
      <div className="mastery-drawer-inner">
        <button type="button" className="mastery-close" onClick={() => drawer.current?.close()}>{t.close}</button>
        {selected && <ConceptDetails concept={selected} concepts={concepts} edges={edges} locale={locale} labsEnabled={labsEnabled} />}
      </div>
    </dialog>
  </section>;
}

function ConceptDetails({ concept, concepts, edges, locale, labsEnabled }: {
  concept: MasteryConcept; concepts: MasteryConcept[]; edges: Edge[]; locale: Locale; labsEnabled: boolean;
}) {
  const t = masteryCopy(locale);
  const percent = masteryFormat(locale);
  const other = locale === 'ar' ? 'en' : 'ar';
  const { lessons, quizzes, labs } = concept.breakdown;
  const connections = edges.filter((edge) => edge.source === concept.slug || edge.target === concept.slug);
  const format = (credit: number, total: number) => total ? percent.format(credit / total) : t.noEvidence;
  return <>
    <header className="mastery-concept-heading" data-status={concept.status}>
      <p>{t.tracks[concept.track]}</p>
      <h2 id="mastery-concept-title"><bdi>{concept.titles[locale]}</bdi></h2>
      <span className="mastery-status">{t.statuses[concept.status]}{concept.score !== null && <> · <bdi>{percent.format(concept.score / 100)}</bdi></>}</span>
    </header>
    <p>{concept.summaries[locale]}</p>
    <div className="mastery-translation" lang={other} dir={other === 'ar' ? 'rtl' : 'ltr'}>
      <strong>{concept.titles[other]}</strong><p>{concept.summaries[other]}</p>
    </div>
    <section className="mastery-detail-section" aria-labelledby="mastery-breakdown">
      <h3 id="mastery-breakdown">{t.breakdown}</h3>
      <dl className="mastery-breakdown">
        <div><dt>{t.lessons}</dt><dd>{format(lessons.credit, lessons.possible)}</dd></div>
        <div><dt>{t.quizzes}</dt><dd>{format(quizzes.credit, quizzes.attempted)}</dd></div>
        <div><dt>{t.labs}</dt><dd>{format(labs.credit, labs.possible)}</dd></div>
        {concept.breakdown.interview && <div><dt>{interviewCopy(locale).nav}</dt>
          <dd><bdi>{percent.format(concept.breakdown.interview.credit / 100)}</bdi></dd></div>}
      </dl>
      <small>{t.fromLatest}</small>
    </section>
    <section className="mastery-detail-section" aria-labelledby="mastery-linked-practice">
      <h3 id="mastery-linked-practice">{t.practice}</h3>
      {concept.items.length ? <ul>{concept.items.map((item) => <li key={`${item.kind}/${item.id}/${'courseSlug' in item ? item.courseSlug : ''}`}>
        <PracticeLink item={item} locale={locale} labsEnabled={labsEnabled} />
      </li>)}</ul> : <p>{t.none}</p>}
    </section>
    {connections.length > 0 && <section className="mastery-detail-section" aria-labelledby="mastery-connections">
      <h3 id="mastery-connections">{t.connections}</h3>
      <ul className="mastery-connections">{connections.map((edge) => <li key={`${edge.source}/${edge.target}/${edge.relation}`}>
        <bdi>{concepts.find(({ slug }) => slug === edge.source)?.titles[locale]}</bdi>
        {' · '}{t.relations[edge.relation]}{' · '}
        <bdi>{concepts.find(({ slug }) => slug === edge.target)?.titles[locale]}</bdi>
      </li>)}</ul>
    </section>}
  </>;
}
