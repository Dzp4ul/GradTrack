export interface PresenceLike {
  is_online?: boolean;
  last_active_at?: string | null;
}

export function parsePresenceDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameCalendarDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

export function formatLastActiveTime(value?: string | null, now = new Date()): string {
  const parsed = parsePresenceDate(value);
  if (!parsed) return '';

  const seconds = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(parsed, yesterday)) return 'yesterday';

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function formatPresenceLabel(presence?: PresenceLike | null): string {
  if (presence?.is_online) return 'Active now';
  const relative = formatLastActiveTime(presence?.last_active_at);
  return relative ? `Last active ${relative}` : 'Offline';
}
