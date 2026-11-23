import type { Locale } from '../../i18n/locales';

const en = {
  bank: 'Question bank', create: 'New question', empty: 'There are no questions in this bank yet.',
  prompt: 'Question prompt', explanation: 'Answer explanation', choice: 'Choice', correct: 'Correct choice',
  choiceCount: 'Number of choices', tags: 'Tags (comma-separated)', save: 'Save question',
  archive: 'Archive question', archived: 'Archived', archivedNotice: 'Archived questions stay in existing course copies.',
  confirmArchive: 'Archive this question? Existing course copies will be kept.',
  saved: 'Question saved.', denied: 'You do not have access to this question bank.',
  invalid: 'Check both languages and the grading rule.',
  conflict: 'This question has changed. Reload the page before editing again.',
  unavailable: 'The question bank is temporarily unavailable.',
  import: 'Import question', choose: 'Choose a bank question', imported: 'Imported copy',
  noImport: 'Create an active question in the bank to import it here.',
  type: 'Question type', mcq: 'Multiple choice', find_bug: 'Find the bug', cli_recall: 'Recall a command',
  language: 'Snippet format', snippet: 'Configuration or code', faultyLines: 'Faulty line numbers (comma-separated)',
  rule: 'Matching rule', expected: 'Expected command or pattern',
  exact: 'Normalized command', flags: 'Independent flag order', regex: 'Full regular expression match',
  flagsHint: 'Use the flag=value form for flags with values.',
  selectLines: 'Select every faulty line.', line: 'Line', command: 'Command',
};
const ar: typeof en = {
  bank: 'بنك الأسئلة', create: 'سؤال جديد', empty: 'لا توجد أسئلة في هذا البنك بعد.',
  prompt: 'نص السؤال', explanation: 'شرح الإجابة', choice: 'الخيار', correct: 'الخيار الصحيح',
  choiceCount: 'عدد الخيارات', tags: 'الوسوم (مفصولة بفواصل)', save: 'حفظ السؤال',
  archive: 'أرشفة السؤال', archived: 'مؤرشف', archivedNotice: 'تبقى نسخ الأسئلة المؤرشفة في الدورات الحالية.',
  confirmArchive: 'هل تريد أرشفة هذا السؤال؟ ستبقى نسخه الحالية في الدورات.',
  saved: 'تم حفظ السؤال.', denied: 'ليس لديك إذن للوصول إلى بنك الأسئلة.',
  invalid: 'راجع النص باللغتين وقاعدة التصحيح.',
  conflict: 'تغيّر السؤال. أعد تحميل الصفحة قبل تعديله مرة أخرى.',
  unavailable: 'بنك الأسئلة غير متاح مؤقتًا.',
  import: 'استيراد سؤال', choose: 'اختر سؤالًا من البنك', imported: 'نسخة مستوردة',
  noImport: 'أضف سؤالًا نشطًا إلى البنك لاستيراده هنا.',
  type: 'نوع السؤال', mcq: 'اختيار من متعدد', find_bug: 'اكتشاف الخطأ', cli_recall: 'استدعاء أمر',
  language: 'تنسيق المقتطف', snippet: 'الإعداد أو الشفرة', faultyLines: 'أرقام الأسطر الخاطئة (مفصولة بفواصل)',
  rule: 'قاعدة المطابقة', expected: 'الأمر أو النمط المتوقع',
  exact: 'مطابقة الأمر بعد توحيد الفراغات', flags: 'ترتيب مستقل للخيارات', regex: 'مطابقة كاملة للتعبير النمطي',
  flagsHint: 'استخدم علامة المساواة بين الخيار وقيمته.',
  selectLines: 'حدد جميع الأسطر الخاطئة.', line: 'السطر', command: 'الأمر',
};

export function assessmentCopy(locale: Locale) {
  return locale === 'ar' ? ar : en;
}
