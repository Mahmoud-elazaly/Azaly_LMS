export function replace<T>(items: T[], index: number, value: T) {
  return items.map((item, at) => at === index ? value : item);
}

export function OrderedControls<T>({ items, index, onChange, text }: {
  items: T[]; index: number; onChange: (value: T[]) => void;
  text: { moveUp: string; moveDown: string; remove: string };
}) {
  function move(offset: number) {
    const next = [...items];
    const destination = index + offset;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  }

  return <div className="builder-controls">
    <button type="button" className="identity-button" disabled={index === 0} onClick={() => move(-1)}>{text.moveUp}</button>
    <button type="button" className="identity-button" disabled={index === items.length - 1} onClick={() => move(1)}>{text.moveDown}</button>
    <button type="button" className="identity-button" onClick={() => onChange(items.filter((_, at) => at !== index))}>{text.remove}</button>
  </div>;
}
