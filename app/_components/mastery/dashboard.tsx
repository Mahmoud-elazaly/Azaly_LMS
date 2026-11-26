import { masteryCopy } from '@/features/mastery/copy';
import type { MasterySnapshot, TrackProgress } from '@/features/mastery/model';
import type { Locale } from '@/i18n/locales';
import { masteryFormat, PracticeLink } from './practice';

function radarPoint(index: number, score: number) {
  const angle = index * Math.PI / 3 - Math.PI / 2;
  return [200 + Math.cos(angle) * score, 126 + Math.sin(angle) * score];
}

function SkillRadar({ tracks, locale }: { tracks: TrackProgress[]; locale: Locale }) {
  const t = masteryCopy(locale);
  const percent = masteryFormat(locale);
  const points = (value: (entry: TrackProgress) => number) => tracks.map((entry, index) => radarPoint(index, value(entry)).join(',')).join(' ');
  return <section className="mastery-panel mastery-radar" aria-labelledby="mastery-radar-title">
    <h2 id="mastery-radar-title">{t.radar}</h2>
    <svg viewBox="0 0 400 252" role="img" aria-labelledby="mastery-radar-title mastery-radar-desc">
      <desc id="mastery-radar-desc">{t.radarDescription}</desc>
      {[25, 50, 75, 100].map((level) => <polygon key={level} className="mastery-radar-grid" points={points(() => level)} />)}
      {tracks.map(({ track }, index) => {
        const [x, y] = radarPoint(index, 100);
        const [lx, ly] = radarPoint(index, 118);
        return <g key={track}>
          <line className="mastery-radar-grid" x1={200} y1={126} x2={x} y2={y} />
          <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central">{new Intl.NumberFormat(locale).format(index + 1)}</text>
        </g>;
      })}
      <polygon className="mastery-radar-area" points={points((entry) => entry.score ?? 0)} />
      {tracks.map(({ track, score }, index) => {
        if (score === null) return null;
        const [cx, cy] = radarPoint(index, score);
        return <circle key={track} className="mastery-radar-dot" cx={cx} cy={cy} r="3.5" />;
      })}
    </svg>
    <ol className="mastery-radar-key">{tracks.map(({ track, score }, index) => <li key={track}>
      <span className="mastery-radar-index" aria-hidden="true">{new Intl.NumberFormat(locale).format(index + 1)}</span>
      <span>{t.tracks[track]}</span><bdi>{score === null ? t.noEvidence : percent.format(score / 100)}</bdi>
    </li>)}</ol>
  </section>;
}

export function MasteryDashboard({ data, locale, labsEnabled }: { data: MasterySnapshot; locale: Locale; labsEnabled: boolean }) {
  const t = masteryCopy(locale);
  const percent = masteryFormat(locale);
  const number = new Intl.NumberFormat(locale);
  return <>
    <div className="mastery-chart-grid">
      <section className="mastery-panel" aria-labelledby="mastery-track-progress">
        <h2 id="mastery-track-progress">{t.trackProgress}</h2>
        <ul className="mastery-track-list">{data.tracks.map(({ track, score, assessed, mastered }) => <li key={track}>
          <div><strong>{t.tracks[track]}</strong><bdi>{score === null ? t.noEvidence : percent.format(score / 100)}</bdi></div>
          {score === null ? <span className="mastery-empty-progress" aria-hidden="true" />
            : <progress aria-label={t.tracks[track]} max={100} value={score} />}
          <small>{t.conceptsMastered} <bdi>{number.format(mastered)}/{number.format(assessed)}</bdi></small>
        </li>)}</ul>
      </section>
      <SkillRadar tracks={data.tracks} locale={locale} />
    </div>
    <section className="mastery-panel mastery-queue" aria-labelledby="mastery-weakest">
      <h2 id="mastery-weakest">{t.weakest}</h2>
      {data.weakest.length ? <ol>{data.weakest.map((entry) => <li key={entry.slug}>
        <div className="mastery-queue-concept"><h3><bdi>{entry.titles[locale]}</bdi></h3><small>{t.tracks[entry.track]}</small></div>
        {entry.action.kind !== 'concept' ? <PracticeLink item={entry.action} locale={locale} labsEnabled={labsEnabled} />
          : <a href={`/${locale}/knowledge-graph?concept=${encodeURIComponent(entry.slug)}`}>{t.graph}</a>}
        <span className="mastery-score"><span className="sr-only">{t.score} </span>
          <bdi>{percent.format(entry.score / 100)}</bdi></span>
      </li>)}</ol> : <p>{t.noWeakest}</p>}
    </section>
  </>;
}
