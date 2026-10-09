export type GraduateAccountPrefill = {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  year_graduated: string;
  address: string;
  program_id: number | null;
  program_name: string;
};

export type GraduateAccountResumeContext = {
  graduateId: number;
  graduateName: string;
  surveyResponseId: number;
  surveyToken: string;
  surveyTitle: string;
  prefill: GraduateAccountPrefill;
  expiresAt: number;
};

const STORAGE_KEY = 'gradtrack_graduate_account_resume_v1';
const RESUME_LIFETIME_MS = 25 * 60 * 1000;

const cleanText = (value: unknown) => String(value ?? '').trim();

export function saveGraduateAccountResume(
  context: Omit<GraduateAccountResumeContext, 'expiresAt'>,
): GraduateAccountResumeContext {
  const stored = { ...context, expiresAt: Date.now() + RESUME_LIFETIME_MS };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Account creation can still fall back to identity verification.
  }
  return stored;
}

export function readGraduateAccountResume(): GraduateAccountResumeContext | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<GraduateAccountResumeContext>;
    const graduateId = Number(parsed.graduateId);
    const surveyResponseId = Number(parsed.surveyResponseId);
    const expiresAt = Number(parsed.expiresAt);
    const surveyToken = cleanText(parsed.surveyToken);
    if (
      !Number.isFinite(graduateId) || graduateId <= 0
      || !Number.isFinite(surveyResponseId) || surveyResponseId <= 0
      || !Number.isFinite(expiresAt) || expiresAt <= Date.now()
      || !surveyToken
      || !parsed.prefill || typeof parsed.prefill !== 'object'
    ) {
      clearGraduateAccountResume();
      return null;
    }

    const programId = Number(parsed.prefill.program_id);
    return {
      graduateId,
      surveyResponseId,
      expiresAt,
      surveyToken,
      surveyTitle: cleanText(parsed.surveyTitle),
      graduateName: cleanText(parsed.graduateName),
      prefill: {
        first_name: cleanText(parsed.prefill.first_name),
        middle_name: cleanText(parsed.prefill.middle_name),
        last_name: cleanText(parsed.prefill.last_name),
        email: cleanText(parsed.prefill.email).toLowerCase(),
        phone: cleanText(parsed.prefill.phone),
        year_graduated: cleanText(parsed.prefill.year_graduated),
        address: cleanText(parsed.prefill.address),
        program_id: Number.isFinite(programId) && programId > 0 ? programId : null,
        program_name: cleanText(parsed.prefill.program_name),
      },
    };
  } catch {
    clearGraduateAccountResume();
    return null;
  }
}

export function hasGraduateAccountResume(): boolean {
  return readGraduateAccountResume() !== null;
}

export function clearGraduateAccountResume(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in hardened browser modes.
  }
}
