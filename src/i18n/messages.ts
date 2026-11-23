import { createTranslator } from 'next-intl';
import type { Locale } from './locales';

const brand = 'Azaly LMS';

const messages = {
  en: {
    brand, version: 'Version', home: 'Home', courses: 'Course catalog', about: 'About',
    skip: 'Skip to content', nav: 'Main navigation', language: 'العربية',
    theme: 'Color theme', light: 'Light', dark: 'Dark', system: 'System',
    hero: 'Build and operate the systems behind modern software.',
    intro: 'Technical training in infrastructure, Linux, containers, observability and DevOps, with learning materials authored in Arabic and English.',
    browse: 'Browse the catalog', topics: 'What we cover',
    linux: 'Linux & infrastructure', platform: 'Containers & orchestration', operations: 'Web, observability & delivery',
    linuxDetail: 'Linux administration, networking and shell scripting',
    platformDetail: 'Docker, Kubernetes and OpenShift',
    operationsDetail: 'NGINX, Prometheus, Grafana, Git and GitHub',
    catalogIntro: 'Browse published courses available in English.',
    empty: 'No courses have been published in English yet.',
    unavailable: 'The course catalog is temporarily unavailable.',
    aboutIntro: '<brand>{name}</brand> is a self-hosted learning platform for practical infrastructure and DevOps education.',
    practice: 'Practical training', practiceDetail: 'Planned Guided Labs will use learner-managed infrastructure. A later NGINX pilot will offer practice in an isolated browser-accessible environment.',
    back: 'Back to course catalog', example: 'Example Linux command',
  },
  ar: {
    brand, version: 'الإصدار', home: 'الرئيسية', courses: 'دليل الدورات', about: 'عن المنصة',
    skip: 'انتقل إلى المحتوى', nav: 'التنقل الرئيسي', language: 'English',
    theme: 'مظهر الواجهة', light: 'فاتح', dark: 'داكن', system: 'حسب النظام',
    hero: 'تعلّم بناء وتشغيل الأنظمة التي تعتمد عليها البرمجيات الحديثة.',
    intro: 'تدريب تقني في البنية التحتية ولينكس والحاويات وقابلية الرصد وDevOps، بمحتوى تعليمي مؤلف بالعربية والإنجليزية.',
    browse: 'تصفّح دليل الدورات', topics: 'المجالات التعليمية',
    linux: 'لينكس والبنية التحتية', platform: 'الحاويات وتنسيقها', operations: 'الويب والرصد وتسليم البرمجيات',
    linuxDetail: 'إدارة لينكس والشبكات وبرمجة سطر الأوامر',
    platformDetail: 'Docker وKubernetes وOpenShift',
    operationsDetail: 'NGINX وPrometheus وGrafana وGit وGitHub',
    catalogIntro: 'تصفّح الدورات المنشورة والمتاحة باللغة العربية.',
    empty: 'لم تُنشر دورات باللغة العربية بعد.',
    unavailable: 'دليل الدورات غير متاح مؤقتًا.',
    aboutIntro: '<brand>{name}</brand> منصة تعليمية ذاتية الاستضافة للتدريب العملي في البنية التحتية وDevOps.',
    practice: 'التدريب العملي', practiceDetail: 'ستُنفّذ المختبرات الموجّهة على بنية تحتية يديرها المتعلم. وفي مرحلة لاحقة سيتاح مختبر NGINX تجريبي في بيئة معزولة يمكن الوصول إليها من المتصفح.',
    back: 'العودة إلى دليل الدورات', example: 'مثال لأمر لينكس',
  },
};

export function copy(locale: Locale) {
  return createTranslator({ locale, messages: messages[locale] });
}
