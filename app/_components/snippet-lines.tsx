import { snippetLines } from '@/features/assessment/policy';

export function SnippetLines({ source, label, selection }: {
  source: string;
  label: string;
  selection?: { name: string; lineLabel: string };
}) {
  return <div className="snippet-lines" dir="ltr" translate="no" tabIndex={0} role="group" aria-label={label}>
    {snippetLines(source).map((line, index) => {
      const content = <><span className="line-number" aria-hidden="true">{index + 1}</span><code>{line || ' '}</code></>;
      return selection ? <label className="snippet-line" key={index}>
        <input type="checkbox" name={selection.name} value={index + 1} aria-label={`${selection.lineLabel} ${index + 1}: ${line}`} />
        {content}
      </label> : <div className="snippet-line" key={index}>{content}</div>;
    })}
  </div>;
}
