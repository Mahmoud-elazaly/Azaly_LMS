import Link from 'next/link';
import { learningCopy } from '@/features/learning/copy';
import { notFound, redirect } from 'next/navigation';
import { updateUser } from '@/features/identity/actions';
import { identityCopy } from '@/features/identity/copy';
import { listUsers } from '@/features/identity/management';
import { AuthorizationError, canAssignRole } from '@/features/identity/policy';
import { returnPath } from '@/features/identity/return-path';
import { currentPrincipal } from '@/features/identity/session';
import { isLocale } from '@/i18n/locales';
import { AuthForm } from '../../_components/auth-form';

export default async function AccountPage({ params, searchParams }: PageProps<'/[locale]/[account]'>) {
  const { locale, account } = await params;
  if (!isLocale(locale)) notFound();
  const t = identityCopy(locale);
  const principal = await currentPrincipal();
  const query = await searchParams;

  if (account === 'login' || account === 'register') {
    const destination = returnPath(locale, query.next);
    if (principal) redirect(destination);
    const login = `/${locale}/login?next=${encodeURIComponent(destination)}`;
    return <section className="page-copy">
      <h1>{t[account]}</h1>
      {account === 'login' && query.registered === '1' && <p role="status">{t.registered}</p>}
      {account === 'register' && <p>{t.guestHint} {t.passwordNote}</p>}
      <AuthForm locale={locale} mode={account} destination={account === 'register' ? `${login}&registered=1` : destination} />
      <Link href={account === 'register' ? login : `/${locale}/register?next=${encodeURIComponent(destination)}`}>
        {account === 'register' ? t.login : t.register}
      </Link>
    </section>;
  }

  if (account !== 'dashboard' && account !== 'profile' && account !== 'admin' && account !== 'instructor' && account !== 'student') notFound();
  if (!principal) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/${account}`)}`);
  if ((account === 'instructor' && principal.role !== 'INSTRUCTOR') ||
      (account === 'student' && principal.role !== 'STUDENT') ||
      (account === 'admin' && principal.role !== 'OWNER' && principal.role !== 'ADMIN')) {
    return <section className="page-copy"><h1>{t[account]}</h1><p>{t.denied}</p></section>;
  }

  if (account === 'admin') {
    let users;
    try {
      users = await listUsers();
    } catch (error) {
      if (error instanceof AuthorizationError) return <section className="page-copy"><h1>{t.admin}</h1><p>{t.denied}</p></section>;
      throw error;
    }
    const action = updateUser.bind(null, locale);
    return <section className="page-copy">
      <h1>{t.admin}</h1>
      {query.result === 'updated' && <p role="status">{t.updated}</p>}
      {query.result === 'rejected' && <p role="alert">{t.rejected}</p>}
      <ul className="identity-users">
        {users.map((entry) => {
          const options = (['ADMIN', 'INSTRUCTOR', 'STUDENT'] as const)
            .filter((role) => canAssignRole(principal.role, entry.role, role));
          return <li key={entry.id} className="notice">
            <h2>{entry.name}</h2>
            <p><bdi>{entry.email}</bdi></p>
            <p>{t[entry.role]} · {entry.banned ? t.suspended : t.active}</p>
            {entry.id !== principal.id && options.length > 0 && <>
              <form action={action} className="identity-inline">
                <input type="hidden" name="id" value={entry.id} />
                <input type="hidden" name="operation" value="role" />
                <label>{t.role}<select name="role" defaultValue={entry.role}>{options.map((role) => <option key={role} value={role}>{t[role]}</option>)}</select></label>
                <button className="identity-button">{t.save}</button>
              </form>
              <form action={action} className="identity-inline">
                <input type="hidden" name="id" value={entry.id} />
                <input type="hidden" name="operation" value="status" />
                <button className="identity-button" name="status" value={entry.banned ? 'restore' : 'suspend'}>{entry.banned ? t.restore : t.suspend}</button>
              </form>
            </>}
          </li>;
        })}
      </ul>
    </section>;
  }

  return <section className="page-copy">
    <h1>{t[account]}</h1>
    {account === 'profile' ? <dl className="notice">
      <dt>{t.name}</dt><dd><bdi>{principal.name}</bdi></dd>
      <dt>{t.email}</dt><dd><bdi>{principal.email}</bdi></dd>
      <dt>{t.role}</dt><dd>{t[principal.role]}</dd>
      <dt>{t.status}</dt><dd>{t.active}</dd>
    </dl> : <>
      <p>{t.welcome} <bdi>{principal.name}</bdi></p>
      <p>{t[principal.role]}</p>
      <Link href={`/${locale}/profile`}>{t.profile}</Link>
      {principal.role === 'STUDENT' && <p><Link href={`/${locale}/learning`}>{learningCopy(locale).learning}</Link></p>}
      {account === 'dashboard' && (principal.role === 'OWNER' || principal.role === 'ADMIN')
        && <p><Link href={`/${locale}/admin`}>{t.admin}</Link></p>}
    </>}
  </section>;
}
