import type { Locale } from '../../i18n/locales';

const en = {
  bank: 'Question bank', create: 'New question', empty: 'There are no questions in this bank yet.',
  prompt: 'Question prompt', explanation: 'Answer explanation', choice: 'Choice', correct: 'Correct choice',
  choiceCount: 'Number of choices', tags: 'Tags (comma-separated)', save: 'Save question',
  archive: 'Archive question', archived: 'Archived', archivedNotice: 'Archived questions stay in existing course copies.',
  confirmArchive: 'Archive this question? Existing course copies will be kept.',
  saved: 'Question saved.', denied: 'You do not have access to this question bank.',
  invalid: 'Check both languages, the choices, and the answer key.',
  conflict: 'This question has changed. Reload the page before editing again.',
  unavailable: 'The question bank is temporarily unavailable.',
  import: 'Import question', choose: 'Choose a bank question', imported: 'Imported copy',
  noImport: 'Create an active question in the bank to import it here.',
};
const ar: typeof en = {
  bank: 'بنك الأسئلة', create: 'سؤال جديد', empty: 'لا توجد أسئلة في هذا البنك بعد.',
  prompt: 'نص السؤال', explanation: 'شرح الإجابة', choice: 'الخيار', correct: 'الخيار الصحيح',
  choiceCount: 'عدد الخيارات', tags: 'الوسوم (مفصولة بفواصل)', save: 'حفظ السؤال',
  archive: 'أرشفة السؤال', archived: 'مؤرشف', archivedNotice: 'تبقى نسخ الأسئلة المؤرشفة في الدورات الحالية.',
  confirmArchive: 'هل تريد أرشفة هذا السؤال؟ ستبقى نسخه الحالية في الدورات.',
  saved: 'تم حفظ السؤال.', denied: 'ليس لديك إذن للوصول إلى بنك الأسئلة.',
  invalid: 'راجع النص باللغتين والخيارات والإجابة الصحيحة.',
  conflict: 'تغيّر السؤال. أعد تحميل الصفحة قبل تعديله مرة أخرى.',
  unavailable: 'بنك الأسئلة غير متاح مؤقتًا.',
  import: 'استيراد سؤال', choose: 'اختر سؤالًا من البنك', imported: 'نسخة مستوردة',
  noImport: 'أضف سؤالًا نشطًا إلى البنك لاستيراده هنا.',
};

export function assessmentCopy(locale: Locale) {
  return locale === 'ar' ? ar : en;
}
