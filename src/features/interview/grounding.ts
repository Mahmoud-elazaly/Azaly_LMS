import type { InterviewSetup, InterviewTrack } from './model';

export type CurriculumSource = {
  track: InterviewTrack;
  slug: string;
  title: string;
  summary: string;
  extract: string | null;
};

const iacGuidance = {
  en: '[Supplemental] Infrastructure as code: review a Terraform plan, protect state, and explain how you detect drift and recover from an unsafe change.',
  ar: '[Supplemental] البنية التحتية ككود: راجع خطة Terraform واحمِ الحالة واشرح كيفية اكتشاف الانحراف والتعافي من تغيير غير آمن.',
};

const rubric = {
  en: 'Score technical accuracy and production/security judgment independently from 0 to 100. Give one overall score for the answers given. Consider verification, failure modes, least privilege and rollback where applicable.',
  ar: 'قيّم الدقة التقنية والتعامل مع الإنتاج والأمان كلًا على حدة من 0 إلى 100. أعطِ نتيجة إجمالية للإجابات المقدمة. راعِ التحقق وحالات الفشل والحد الأدنى من الصلاحيات والتراجع عند الحاجة.',
};

const roleFocus = {
  en: { sysadmin: 'Focus on diagnosis, service recovery, and safe configuration changes.',
    devops: 'Focus on repeatable delivery, verification, and safe rollback.',
    sre: 'Focus on user impact, diagnostic signals, and reliable recovery.' },
  ar: { sysadmin: 'ركّز على التشخيص واستعادة الخدمات وتغيير الإعدادات بأمان.',
    devops: 'ركّز على قابلية تكرار التسليم والتحقق والتراجع الآمن.',
    sre: 'ركّز على أثر المشكلة على المستخدم وإشارات التشخيص والتعافي الموثوق.' },
};

const levelFocus = {
  en: { junior: 'Expect a correct basic workflow and a way to check the result.',
    mid: 'Expect a diagnosis, supporting evidence, and a rollout or recovery plan.',
    senior: 'Expect explicit trade-offs, failure isolation, and a plan to verify and reverse changes.' },
  ar: { junior: 'توقّع خطوات أساسية صحيحة وطريقة للتحقق من النتيجة.',
    mid: 'توقّع تشخيصًا وأدلّة داعمة وخطةً للنشر أو التعافي.',
    senior: 'توقّع شرح المفاضلات وعزل الفشل وخطةً للتحقق والتراجع عن التغييرات.' },
};

export function buildGrounding(setup: InterviewSetup, sources: readonly CurriculumSource[]) {
  const curriculum = sources.filter(({ track }) => setup.tracks.includes(track)).map(({ track, slug, title, summary, extract }) => ({
    track, slug, title: title.slice(0, 120), summary: summary.slice(0, 340), ...(extract && { publishedLesson: extract.slice(0, 520) }),
  }));
  return {
    curriculum,
    rubric: [rubric[setup.locale], roleFocus[setup.locale][setup.role], levelFocus[setup.locale][setup.seniority]].join(' '),
    supplemental: setup.tracks.includes('iac') ? [iacGuidance[setup.locale]] : [],
  };
}
