import type { Locale } from '../../i18n/locales';

const en = {
  login: 'Sign in', register: 'Create account', logout: 'Sign out', dashboard: 'Dashboard',
  profile: 'Profile', admin: 'User management', instructor: 'Instructor dashboard', student: 'Student dashboard',
  email: 'Email address', password: 'Password', name: 'Name', role: 'Role', status: 'Account status',
  active: 'Active', suspended: 'Suspended', suspend: 'Suspend', restore: 'Restore', save: 'Save role',
  pending: 'Please wait…', denied: 'You do not have access to this page.',
  rejected: 'The request could not be completed. Check your details and try again.',
  limited: 'Too many attempts. Try again later.',
  unavailable: 'Could not reach the account service. Try again in a moment.',
  registered: 'You can now try signing in with your email and password.',
  guestHint: 'Use at least 12 characters for your password.',
  welcome: 'Welcome', updated: 'Account updated.', passwordNote: 'Email verification and password recovery are unavailable.',
  OWNER: 'Owner', ADMIN: 'Administrator', INSTRUCTOR: 'Instructor', STUDENT: 'Student',
};
const ar: typeof en = {
  login: 'تسجيل الدخول', register: 'إنشاء حساب', logout: 'تسجيل الخروج', dashboard: 'لوحة التحكم',
  profile: 'الملف الشخصي', admin: 'إدارة المستخدمين', instructor: 'لوحة المدرّب', student: 'لوحة الطالب',
  email: 'البريد الإلكتروني', password: 'كلمة المرور', name: 'الاسم', role: 'الدور', status: 'حالة الحساب',
  active: 'نشط', suspended: 'موقوف', suspend: 'إيقاف الحساب', restore: 'إعادة تنشيط الحساب', save: 'حفظ الدور',
  pending: 'يرجى الانتظار…', denied: 'ليس لديك إذن للوصول إلى هذه الصفحة.',
  rejected: 'تعذّر إكمال الطلب. تحقّق من البيانات وحاول مجدداً.',
  limited: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.',
  unavailable: 'تعذّر الاتصال بخدمة الحسابات. حاول مجددًا بعد قليل.',
  registered: 'يمكنك الآن محاولة تسجيل الدخول بالبريد الإلكتروني وكلمة المرور.',
  guestHint: 'استخدم ١٢ حرفاً على الأقل لكلمة المرور.',
  welcome: 'مرحباً', updated: 'تم تحديث الحساب.', passwordNote: 'التحقق من البريد الإلكتروني واستعادة كلمة المرور غير متاحين.',
  OWNER: 'المالك', ADMIN: 'المسؤول', INSTRUCTOR: 'المدرّب', STUDENT: 'الطالب',
};

export function identityCopy(locale: Locale) {
  return locale === 'ar' ? ar : en;
}
