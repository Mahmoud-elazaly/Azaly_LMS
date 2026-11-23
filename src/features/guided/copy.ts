import type { Locale } from '../../i18n/locales';

const en = {
  labs: 'Guided Labs', addLab: 'Add Guided Lab', labTitle: 'Lab title', instructions: 'Instructions',
  commands: 'Commands', starter: 'Starter snippet', checkpoints: 'Checkpoints', checkpoint: 'Checkpoint',
  addCheckpoint: 'Add checkpoint', prompt: 'Evidence prompt (optional)', evidence: 'Evidence (optional)',
  selfReported: 'Self-reported', instructorReviewed: 'Instructor-reviewed', awaiting: 'Awaiting instructor review',
  saveProgress: 'Save lab progress', complete: 'Record self-reported completion', saved: 'Lab progress saved.',
  reported: 'Self-reported completion recorded.', pending: 'Saving…',
  error: 'Could not save the lab. Check your progress or reload and try again.',
  allCheckpoints: 'Complete every checkpoint before recording completion.',
  reviewed: 'Review recorded.', queue: 'Guided Lab reviews', empty: 'There are no submitted Guided Labs in your courses.',
  denied: 'You do not have access to Guided Lab reviews.', unavailable: 'Guided Lab reviews are temporarily unavailable.',
  learner: 'Learner', decision: 'Review decision', feedback: 'Feedback (optional)',
  APPROVED: 'Completion accepted', NOT_APPROVED: 'Completion not accepted', recordReview: 'Record review',
  noEvidence: 'The learner submitted no written evidence.',
  informational: 'Run these instructions in your own practice environment.',
};
const ar: typeof en = {
  labs: 'المختبرات الموجّهة', addLab: 'إضافة مختبر موجّه', labTitle: 'عنوان المختبر', instructions: 'التعليمات',
  commands: 'الأوامر', starter: 'مقتطف البدء', checkpoints: 'نقاط التحقّق', checkpoint: 'نقطة التحقّق',
  addCheckpoint: 'إضافة نقطة تحقّق', prompt: 'طلب الدليل (اختياري)', evidence: 'الدليل (اختياري)',
  selfReported: 'إبلاغ ذاتي', instructorReviewed: 'راجعه المدرّب', awaiting: 'بانتظار مراجعة المدرّب',
  saveProgress: 'حفظ تقدّم المختبر', complete: 'تسجيل الإكمال بإبلاغ ذاتي', saved: 'تم حفظ تقدّم المختبر.',
  reported: 'تم تسجيل الإكمال بإبلاغ ذاتي.', pending: 'جارٍ الحفظ…',
  error: 'تعذّر حفظ المختبر. راجع تقدّمك أو أعد تحميل الصفحة وحاول مجددًا.',
  allCheckpoints: 'أكمل جميع نقاط التحقّق قبل تسجيل الإكمال.',
  reviewed: 'تم تسجيل المراجعة.', queue: 'مراجعات المختبرات الموجّهة', empty: 'لا توجد مختبرات موجّهة مُرسلة في دوراتك.',
  denied: 'ليس لديك إذن للوصول إلى مراجعات المختبرات الموجّهة.', unavailable: 'مراجعات المختبرات الموجّهة غير متاحة مؤقتًا.',
  learner: 'المتعلّم', decision: 'قرار المراجعة', feedback: 'الملاحظات (اختيارية)',
  APPROVED: 'تم قبول الإكمال', NOT_APPROVED: 'لم يُقبل الإكمال', recordReview: 'تسجيل المراجعة',
  noEvidence: 'لم يرسل المتعلّم دليلًا مكتوبًا.',
  informational: 'نفّذ هذه التعليمات في بيئة التدريب الخاصة بك.',
};

export function guidedCopy(locale: Locale) {
  return locale === 'ar' ? ar : en;
}
