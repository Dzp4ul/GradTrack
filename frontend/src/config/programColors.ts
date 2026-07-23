export const PROGRAM_COLORS: Record<string, string> = {
  BSCS: 'rgb(255, 196, 0)',
  BSHM: '#ef4444',
  BSED: '#3b82f6',
  BEED: '#7dd3fc',
  ACT: '#6b7280',
};

export const DEFAULT_PROGRAM_COLOR = '#3b82f6';

export function getProgramColor(programCode: string | null | undefined) {
  if (!programCode) return DEFAULT_PROGRAM_COLOR;
  return PROGRAM_COLORS[programCode.toUpperCase()] ?? DEFAULT_PROGRAM_COLOR;
}
