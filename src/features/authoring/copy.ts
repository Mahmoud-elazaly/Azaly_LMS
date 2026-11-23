import type { Locale } from '../../i18n/locales';

const en = {
  builder: 'Course builder', preview: 'Preview draft', create: 'Create course', slug: 'Course slug', position: 'Catalog order',
  courseTitle: 'Course title', summary: 'Course summary', language: 'Content language',
  addQuiz: 'Add quiz', quizTitle: 'Quiz title', addQuestion: 'Add question', questionPrompt: 'Question',
  choice: 'Choice', correctChoice: 'Correct choice',
  addModule: 'Add module', addLesson: 'Add lesson', addBlock: 'Add block',
  moduleTitle: 'Module title', lessonTitle: 'Lesson title', blockText: 'Block content', blockType: 'Block type',
  paragraph: 'Paragraph', heading: 'Heading', code: 'Code', callout: 'Callout',
  moveUp: 'Move earlier', moveDown: 'Move later', remove: 'Remove', archive: 'Archive course',
  confirmArchive: 'Archive this course and remove it from the public catalog?',
  save: 'Save draft', saved: 'Draft saved.', publish: 'Publish', republish: 'Republish', unpublish: 'Unpublish',
  draft: 'Draft', published: 'Live', withdrawn: 'Unpublished',
  validation: 'Check the fields. Publishing requires complete course metadata, modules, lessons and blocks in every started language.',
  conflict: 'This draft changed or the slug is in use. Reload before trying again.',
  unavailable: 'The course builder is unavailable.', denied: 'You do not have access to this course builder.',
  empty: 'No courses to edit.', pending: 'Working…', courseList: 'Courses', unpublished: 'Course unpublished.',
  coursePublished: 'Course published.',
};
const ar: typeof en = {
  builder: 'منشئ الدورات', preview: 'معاينة المسودة', create: 'إنشاء دورة', slug: 'معرّف الدورة', position: 'ترتيب الدليل',
  courseTitle: 'عنوان الدورة', summary: 'ملخص الدورة', language: 'لغة المحتوى',
  addQuiz: 'إضافة اختبار', quizTitle: 'عنوان الاختبار', addQuestion: 'إضافة سؤال', questionPrompt: 'السؤال',
  choice: 'الخيار', correctChoice: 'الخيار الصحيح',
  addModule: 'إضافة وحدة', addLesson: 'إضافة درس', addBlock: 'إضافة كتلة',
  moduleTitle: 'عنوان الوحدة', lessonTitle: 'عنوان الدرس', blockText: 'محتوى الكتلة', blockType: 'نوع الكتلة',
  paragraph: 'فقرة', heading: 'عنوان', code: 'شفرة', callout: 'تنبيه',
  moveUp: 'نقل للأعلى', moveDown: 'نقل للأسفل', remove: 'حذف', archive: 'أرشفة الدورة',
  confirmArchive: 'هل تريد أرشفة هذه الدورة وإزالتها من الدليل العام؟',
  save: 'حفظ المسودة', saved: 'تم حفظ المسودة.', publish: 'نشر', republish: 'إعادة النشر', unpublish: 'إلغاء النشر',
  draft: 'مسودة', published: 'منشورة', withdrawn: 'غير منشورة',
  validation: 'راجع الحقول. يتطلب النشر اكتمال بيانات الدورة والوحدات والدروس والكتل في كل لغة بدأت تحريرها.',
  conflict: 'تغيّرت المسودة أو أن المعرّف مستخدم. أعد تحميل الصفحة وحاول مجدداً.',
  unavailable: 'منشئ الدورات غير متاح.', denied: 'ليس لديك صلاحية الوصول إلى منشئ هذه الدورة.',
  empty: 'لا توجد دورات للتحرير.', pending: 'جارٍ التنفيذ…', courseList: 'الدورات', unpublished: 'تم إلغاء نشر الدورة.',
  coursePublished: 'تم نشر الدورة.',
};

export function builderCopy(locale: Locale) { return locale === 'ar' ? ar : en; }
