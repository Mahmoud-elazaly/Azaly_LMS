import type { Locale } from '../../i18n/locales';

const en = {
  learning: 'My learning', enroll: 'Enroll', signInToEnroll: 'Sign in to enroll', empty: 'You have no enrollments yet.',
  denied: 'This learning area is restricted to Students.', unavailable: 'This course or translation is unavailable.',
  error: 'Could not save. Check your answers or try again.', completed: 'Completed lessons', progress: 'Course progress',
  complete: 'Mark lesson complete', done: 'Lesson completed', addBookmark: 'Bookmark lesson', removeBookmark: 'Remove bookmark',
  bookmarks: 'Bookmarked lessons', quizzes: 'Quizzes', submit: 'Submit answers',
  outline: 'Course outline', jumpToLesson: 'Skip to current lesson', codeExample: 'Code example',
  grades: 'Grade history', score: 'Score', noGrades: 'No graded attempts yet.', pending: 'Saving…',
  enrollment: 'Enrolled course',
};
const ar: typeof en = {
  learning: 'تعلّمي', enroll: 'التسجيل في الدورة', signInToEnroll: 'سجّل الدخول للتسجيل في الدورة', empty: 'لم تسجّل في أي دورة بعد.',
  denied: 'هذه المساحة التعليمية مخصّصة للطلاب.', unavailable: 'هذه الدورة أو ترجمتها غير متاحة.',
  error: 'تعذّر الحفظ. راجع الإجابات أو أعد المحاولة.', completed: 'الدروس المكتملة', progress: 'التقدّم في الدورة',
  complete: 'إكمال الدرس', done: 'تم إكمال الدرس', addBookmark: 'حفظ الدرس', removeBookmark: 'إزالة الدرس من المحفوظات',
  bookmarks: 'الدروس المحفوظة', quizzes: 'الاختبارات', submit: 'إرسال الإجابات',
  outline: 'مخطّط الدورة', jumpToLesson: 'انتقل إلى الدرس الحالي', codeExample: 'مثال برمجي',
  grades: 'سجل الدرجات', score: 'الدرجة', noGrades: 'لا توجد محاولات مصحّحة بعد.', pending: 'جارٍ الحفظ…',
  enrollment: 'الدورة المسجّلة',
};

export function learningCopy(locale: Locale) { return locale === 'ar' ? ar : en; }
