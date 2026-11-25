import { masteryEvidence } from '../../db/learning';
import type { Locale } from '../../i18n/locales';
import { requireSession } from '../identity/session';
import { studentRoles } from '../learning/policy';
import { authorizeLearningResult } from '../learning/service';
import { realLabEnabled } from '../real-lab/service';
import { calculateMastery } from './calculate';
import type { Evidence } from './model';

export async function readMastery(locale: Locale, headers?: Headers) {
  const { token } = await requireSession(studentRoles, headers);
  const evidence = await authorizeLearningResult(masteryEvidence<Evidence>(token, locale));
  return calculateMastery(evidence, realLabEnabled());
}
