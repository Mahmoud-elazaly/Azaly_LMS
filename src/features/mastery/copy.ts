import type { Locale } from '../../i18n/locales';
import type { MasteryStatus, Relation, Track } from './model';

const tracks: Record<Locale, Record<Track, string>> = {
  en: { 'linux-os': 'Linux / OS', 'web-proxy': 'Web / Proxy', 'git-ci': 'Git / CI-CD', containers: 'Containers / K8s',
    observability: 'Observability', security: 'Security' },
  ar: { 'linux-os': 'لينكس والأنظمة', 'web-proxy': 'الويب والوكيل', 'git-ci': 'Git والتكامل المستمر', containers: 'الحاويات وK8s',
    observability: 'قابلية الرصد', security: 'الأمن' },
};
const relations: Record<Locale, Record<Relation, string>> = {
  en: { prerequisite: 'Prerequisite', integrates_with: 'Integrates with', monitors: 'Monitors', secures: 'Secures', deploys_to: 'Deploys to' },
  ar: { prerequisite: 'متطلب سابق', integrates_with: 'يتكامل مع', monitors: 'يراقب', secures: 'يؤمّن', deploys_to: 'ينشر إلى' },
};
const statuses: Record<Locale, Record<MasteryStatus, string>> = {
  en: { notStarted: 'Not Started', inProgress: 'In Progress', mastered: 'Mastered', needsRemediation: 'Needs Remediation' },
  ar: { notStarted: 'لم يبدأ', inProgress: 'قيد التقدم', mastered: 'متقَن', needsRemediation: 'يحتاج إلى مراجعة' },
};
const ui = {
  en: {
    graph: 'Knowledge Graph', mastery: 'My Mastery', graphIntro: 'Explore how skills connect across tracks. Open a concept to see its evidence and practice.',
    masteryIntro: 'See where you are making progress and what to practice next.', track: 'Track', allTracks: 'All tracks',
    relation: 'Relationship', allRelations: 'All relationships', graphCanvas: 'Knowledge map. Drag the background or use the arrow keys to pan.',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset view', close: 'Close concept',
    noGraphMatches: 'No concepts match these filters.', connections: 'Connections', conceptList: 'Browse Visible Concepts',
    trackProgress: 'Track Progress', radar: 'Skill Radar', radarDescription: 'Mastery by domain on a scale from 0 to 100. Scores for all six domains are listed below.',
    weakest: 'Weakest Concepts', noWeakest: 'No practice is due in the concepts with available materials.',
    score: 'Mastery score', practice: 'Linked Practice', none: 'No practice materials are available for this concept yet.',
    noEvidence: 'No evidence', breakdown: 'Mastery Breakdown', lessons: 'Lesson completion', quizzes: 'Quiz accuracy', labs: 'Lab credit',
    fromLatest: 'Uses the latest attempt for each quiz.', lesson: 'Lesson', quiz: 'Quiz', guided: 'Guided Lab', real: 'Real Lab',
    enroll: 'Open Course to Enroll', realTitle: 'NGINX Reverse Proxy Pilot', complete: 'Completed', verify: 'System-verified',
    selfReported: 'Self-reported', instructorReviewed: 'Instructor-reviewed', rejected: 'Review did not approve completion',
    denied: 'This workspace is available to learners.', error: 'Mastery is temporarily unavailable. Refresh the page to try again.',
    conceptsMastered: 'Concepts mastered',
    refresh: 'Refresh mastery', refreshing: 'Refreshing mastery…',
  },
  ar: {
    graph: 'خريطة المعرفة', mastery: 'مستوى إتقاني', graphIntro: 'استكشف ترابط المهارات بين المسارات. افتح أي مفهوم للتعرّف إلى أدلّة الإتقان والتمارين المرتبطة به.',
    masteryIntro: 'تابع تقدّمك واعرف ما ينبغي أن تتدرّب عليه بعد ذلك.', track: 'المسار', allTracks: 'كل المسارات',
    relation: 'العلاقة', allRelations: 'كل العلاقات', graphCanvas: 'خريطة المعرفة. حرّك العرض بسحب الخلفية أو بمفاتيح الأسهم.',
    zoomIn: 'تكبير', zoomOut: 'تصغير', reset: 'إعادة ضبط العرض', close: 'إغلاق المفهوم',
    noGraphMatches: 'لا توجد مفاهيم تطابق عوامل التصفية.', connections: 'العلاقات', conceptList: 'استعراض المفاهيم الظاهرة',
    trackProgress: 'تقدّم المسارات', radar: 'مخطط المهارات', radarDescription: 'الإتقان حسب المجال على مقياس من ٠ إلى ١٠٠. تظهر درجات المجالات الستة في القائمة أدناه.',
    weakest: 'المفاهيم الأضعف', noWeakest: 'لا توجد تمارين مستحقة في المفاهيم التي تتوفر لها مواد تدريبية.',
    score: 'درجة الإتقان', practice: 'التمارين المرتبطة', none: 'لا تتوفر مواد تدريبية لهذا المفهوم بعد.',
    noEvidence: 'لا توجد أدلّة', breakdown: 'تفاصيل الإتقان', lessons: 'إكمال الدروس', quizzes: 'دقّة الاختبارات', labs: 'رصيد المختبرات',
    fromLatest: 'تُحتسب أحدث محاولة في كل اختبار.', lesson: 'درس', quiz: 'اختبار', guided: 'مختبر موجّه', real: 'مختبر حقيقي',
    enroll: 'فتح الدورة للتسجيل', realTitle: 'مختبر الوكيل العكسي NGINX', complete: 'مكتمل', verify: 'تحقّق النظام',
    selfReported: 'إكمال مُبلّغ ذاتياً', instructorReviewed: 'راجعه المدرّب', rejected: 'لم يعتمد المدرّب الإكمال',
    denied: 'مساحة العمل هذه متاحة للمتعلّمين.', error: 'بيانات الإتقان غير متاحة مؤقتاً. حدّث الصفحة للمحاولة مجدداً.',
    conceptsMastered: 'المفاهيم المتقنة',
    refresh: 'تحديث الإتقان', refreshing: 'جارٍ تحديث الإتقان…',
  },
};

export function masteryCopy(locale: Locale) {
  return { ...ui[locale], tracks: tracks[locale], relations: relations[locale], statuses: statuses[locale] };
}
