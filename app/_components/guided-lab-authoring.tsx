import { useId } from 'react';
import { builderCopy } from '@/features/authoring/copy';
import { guidedCopy } from '@/features/guided/copy';
import type { GuidedTemplate } from '@/features/guided/policy';
import { direction, type Locale } from '@/i18n/locales';
import { OrderedControls, replace } from './ordered-fields';

type Labels = ReturnType<typeof guidedCopy>;

function LabFields({ lab, language, labels, orderText, onChange }: {
  lab: GuidedTemplate; language: Locale; labels: Labels;
  orderText: ReturnType<typeof builderCopy>; onChange: (lab: GuidedTemplate) => void;
}) {
  const fieldId = useId();
  function translate(field: 'titles' | 'instructions' | 'evidencePrompt', value: string) {
    onChange({ ...lab, [field]: { ...lab[field], [language]: value } });
  }

  function setCheckpoints(checkpoints: GuidedTemplate['checkpoints']) {
    onChange({ ...lab, checkpoints });
  }

  return <fieldset className="notice builder-fields">
    <legend>{lab.titles[language] || labels.labTitle}</legend>
    <label>{labels.labTitle}<input dir={direction(language)} value={lab.titles[language] ?? ''} maxLength={160}
      onChange={(event) => translate('titles', event.target.value)} /></label>
    <div className="guided-field">
      <label htmlFor={`${fieldId}-instructions`}>{labels.instructions}</label>
      <textarea id={`${fieldId}-instructions`} dir={direction(language)} value={lab.instructions[language] ?? ''} rows={4} maxLength={6000}
        onChange={(event) => translate('instructions', event.target.value)} />
    </div>
    <div className="guided-field">
      <label htmlFor={`${fieldId}-commands`}>{labels.commands}</label>
      <textarea id={`${fieldId}-commands`} dir="ltr" className="guided-input-code" value={lab.commands} rows={3} maxLength={12000}
        onChange={(event) => onChange({ ...lab, commands: event.target.value })} />
    </div>
    <div className="guided-field">
      <label htmlFor={`${fieldId}-starter`}>{labels.starter}</label>
      <textarea id={`${fieldId}-starter`} dir="ltr" className="guided-input-code" value={lab.starter} rows={4} maxLength={12000}
        onChange={(event) => onChange({ ...lab, starter: event.target.value })} />
    </div>
    <div className="guided-field">
      <label htmlFor={`${fieldId}-evidence`}>{labels.prompt}</label>
      <textarea id={`${fieldId}-evidence`} dir={direction(language)} value={lab.evidencePrompt[language] ?? ''} rows={2} maxLength={1200}
        onChange={(event) => translate('evidencePrompt', event.target.value)} />
    </div>
    {lab.checkpoints.map((step, index) => <div className="builder-fields" key={step.id}>
      <label>{labels.checkpoint} {index + 1}<input dir={direction(language)} value={step.labels[language] ?? ''} maxLength={300}
        onChange={(event) => setCheckpoints(replace(lab.checkpoints, index, {
          ...step, labels: { ...step.labels, [language]: event.target.value },
        }))} /></label>
      <OrderedControls items={lab.checkpoints} index={index} onChange={setCheckpoints} text={orderText} />
    </div>)}
    <button className="identity-button" type="button" disabled={lab.checkpoints.length >= 30}
      onClick={() => setCheckpoints([...lab.checkpoints, { id: crypto.randomUUID(), labels: {} }])}>{labels.addCheckpoint}</button>
  </fieldset>;
}

export function GuidedLabFields({ labs, locale, language, onChange }: {
  labs: GuidedTemplate[]; locale: Locale; language: Locale; onChange: (labs: GuidedTemplate[]) => void;
}) {
  const text = guidedCopy(locale);
  const orderText = builderCopy(locale);
  return <section className="builder-fields">
    <h2>{text.labs}</h2>
    {labs.map((lab, index) => <div key={lab.id} className="builder-fields">
      <LabFields lab={lab} language={language} labels={text} orderText={orderText}
        onChange={(value) => onChange(replace(labs, index, value))} />
      <OrderedControls items={labs} index={index} onChange={onChange} text={orderText} />
    </div>)}
    <button className="identity-button" type="button" disabled={labs.length >= 20} onClick={() => onChange([...labs, {
      id: crypto.randomUUID(), labMode: 'GUIDED', titles: {}, instructions: {}, commands: '', starter: '',
      checkpoints: [], evidencePrompt: {},
    }])}>{text.addLab}</button>
  </section>;
}
