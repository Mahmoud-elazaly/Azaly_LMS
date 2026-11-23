import { z } from 'zod';
import type { Locale } from '../../i18n/locales';

const endpoint = z.url().refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password && (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  );
});

const environment = z.object({
  INVITATION_MAIL_API_KEY: z.string().trim().min(1),
  INVITATION_MAIL_FROM: z.email(),
  INVITATION_MAIL_URL: endpoint.default('https://api.resend.com/emails'),
});
const accepted = z.object({ id: z.string().min(1) });

export function invitationMailer() {
  const config = environment.safeParse(process.env);
  if (!config.success) return null;
  const { INVITATION_MAIL_API_KEY: key, INVITATION_MAIL_FROM: from, INVITATION_MAIL_URL: url } = config.data;

  return async ({ to, link, locale }: { to: string; link: string; locale: Locale }) => {
    const content = locale === 'ar' ? {
      subject: 'دعوة إلى Azaly LMS',
      text: `أُنشئت لك دعوة للوصول إلى Azaly LMS. افتح الرابط خلال ٤٨ ساعة لتعيين كلمة المرور وتفعيل حسابك.\n\n${link}\n\nإذا لم تتوقع هذه الدعوة، يمكنك تجاهلها.`,
    } : {
      subject: 'Your Azaly LMS invitation',
      text: `You have been invited to Azaly LMS. Open this link within 48 hours to set your password and activate your account.\n\n${link}\n\nIf you were not expecting this invitation, you can ignore it.`,
    };
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], ...content }),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      return response.ok && accepted.safeParse(await response.json()).success;
    } catch {
      return false;
    }
  };
}
