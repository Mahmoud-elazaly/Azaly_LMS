'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLocale } from '../../i18n/locales';
import { getAuth } from './auth';
import { managementInput, manageUser } from './management';

export async function updateUser(locale: string, form: FormData) {
  if (!isLocale(locale)) return;
  const request = new Headers(await headers());
  const operation = form.get('operation');
  const input = managementInput.safeParse({
    id: form.get('id'), operation, role: form.get('role'),
    banned: form.get('status') === 'suspend' ? true : form.get('status') === 'restore' ? false : undefined,
  });
  let updated = false;
  try {
    if (input.success && request.get('origin') === getAuth().origin) {
      await manageUser(input.data, request);
      updated = true;
    }
  } catch {
    // User-facing feedback stays generic.
  }
  redirect(`/${locale}/admin?result=${updated ? 'updated' : 'rejected'}`);
}
