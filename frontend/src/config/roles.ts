export const ROLES = {
  ADMIN: 'admin',
  RESEARCH_COORDINATOR: 'research_coordinator',
  MIS_STAFF: 'mis_staff',
  REGISTRAR: 'registrar',
  ALUMNI_PRESIDENT: 'alumni_president',
  DEAN_CCS: 'dean_cs',
  DEAN_COED: 'dean_coed',
  DEAN_HM: 'dean_hm',
} as const;

export type PersonnelRole = typeof ROLES[keyof typeof ROLES];

export const ROLE_LABELS: Record<PersonnelRole, string> = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.RESEARCH_COORDINATOR]: 'Research Coordinator',
  [ROLES.MIS_STAFF]: 'MIS Staff',
  [ROLES.REGISTRAR]: 'Registrar',
  [ROLES.ALUMNI_PRESIDENT]: 'Alumni President',
  [ROLES.DEAN_CCS]: 'Dean - CCS',
  [ROLES.DEAN_COED]: 'Dean - COED',
  [ROLES.DEAN_HM]: 'Dean - HM',
};

export const PERSONNEL_ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
export const ADMIN_ROLES = [ROLES.ADMIN];
export const RESEARCH_COORDINATOR_ROLES = [ROLES.RESEARCH_COORDINATOR];
export const ALUMNI_PRESIDENT_ROLES = [ROLES.ALUMNI_PRESIDENT];
export const DEAN_ROLES = [ROLES.DEAN_CCS, ROLES.DEAN_COED, ROLES.DEAN_HM];
export const JOB_POSTING_ROLES = [ROLES.RESEARCH_COORDINATOR, ROLES.ALUMNI_PRESIDENT, ...DEAN_ROLES];
