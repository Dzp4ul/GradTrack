import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';

export interface NotificationItem {
  key: string;
  type: string;
  title: string;
  message: string;
  created_at: string | null;
  link: string | null;
  priority: string;
  read: boolean;
  category?: 'browse_jobs' | 'job_posting' | 'general';
}

export interface NotificationSnapshot {
  notifications: NotificationItem[];
  unread_count: number;
  unread_by_category?: Record<string, number>;
}

interface NotificationsResponse {
  success: boolean;
  data?: NotificationSnapshot;
  error?: string;
}

interface NotificationBellProps {
  audience: 'admin' | 'graduate';
  colorScheme?: 'light' | 'dark';
  className?: string;
  onSnapshot?: (snapshot: NotificationSnapshot) => void;
}

const typeStyles: Record<string, string> = {
  announcement: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200',
  approval: 'bg-amber-50 text-amber-700 border-amber-200 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
  forum: 'bg-blue-50 text-blue-700 border-blue-200 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200',
  forum_comment: 'bg-blue-50 text-blue-700 border-blue-200 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200',
  forum_report: 'bg-amber-50 text-amber-700 border-amber-200 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
  post_reaction: 'bg-rose-50 text-rose-700 border-rose-200 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200',
  graduate: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
  job_opportunity: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
  job_posting: 'bg-amber-50 text-amber-700 border-amber-200 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
  job_share: 'bg-blue-50 text-blue-700 border-blue-200 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200',
  response: 'bg-violet-50 text-violet-700 border-violet-200 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-200',
  survey: 'bg-rose-50 text-rose-700 border-rose-200 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200',
  user: 'bg-slate-50 text-slate-700 border-slate-200 dark:border-slate-500/50 dark:bg-slate-700/60 dark:text-slate-200',
};

const typeLabels: Record<string, string> = {
  forum_comment: 'Forum Comment',
  forum_report: 'Forum Report',
  post_reaction: 'Post Reaction',
  job_opportunity: 'New Job',
  job_posting: 'Job Posting',
  job_share: 'Shared Job',
};

function formatRelativeTime(value: string | null) {
  if (!value) return 'Just now';

  const timestamp = new Date(value.replace(' ', 'T')).getTime();
  if (Number.isNaN(timestamp)) return value;

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function formatNotificationType(type: string) {
  return typeLabels[type] || type.replace(/[_-]+/g, ' ');
}

export default function NotificationBell({ audience, colorScheme = 'light', className = '', onSnapshot }: NotificationBellProps) {
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const isLiveNotificationsEnabled = import.meta.env.PROD && import.meta.env.VITE_ENABLE_NOTIFICATIONS_SSE === '1';

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_ENDPOINTS.NOTIFICATIONS}?limit=50&audience=${audience}`, {
        credentials: 'include',
      });
      const data = (await response.json()) as NotificationsResponse;

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Unable to load notifications');
      }

      setNotifications(Array.isArray(data.data.notifications) ? data.data.notifications : []);
      setUnreadCount(Number(data.data.unread_count || 0));
      onSnapshot?.(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [audience, onSnapshot]);

  useEffect(() => {
    void fetchNotifications();
    const intervalId = window.setInterval(() => void fetchNotifications(true), 30000);
    return () => window.clearInterval(intervalId);
  }, [fetchNotifications]);

  useEffect(() => {
    const handleNotificationsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ audience?: string }>).detail;
      if (!detail?.audience || detail.audience === audience) {
        void fetchNotifications(true);
      }
    };

    window.addEventListener('gradtrack:notifications-updated', handleNotificationsUpdated);
    return () => window.removeEventListener('gradtrack:notifications-updated', handleNotificationsUpdated);
  }, [audience, fetchNotifications]);

  useEffect(() => {
    if (!isLiveNotificationsEnabled) {
      return;
    }

    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      if (streamRef.current) {
        streamRef.current.close();
      }

      const streamUrl = `${API_ENDPOINTS.NOTIFICATIONS}?limit=20&audience=${audience}&stream=1`;
      const eventSource = new EventSource(streamUrl, { withCredentials: true });
      streamRef.current = eventSource;

      eventSource.addEventListener('notifications', () => {
        void fetchNotifications(true);
        window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', {
          detail: { audience },
        }));
      });

      eventSource.addEventListener('close', () => {
        eventSource.close();
      });

      eventSource.onerror = () => {
        eventSource.close();
        if (reconnectTimerRef.current === null && !disposed) {
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 3000);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
    };
  }, [audience, fetchNotifications, isLiveNotificationsEnabled]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markRead = async (key: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.key === key ? { ...notification, read: true } : notification
      )
    );
    setUnreadCount((current) => Math.max(0, current - 1));

    try {
      const response = await fetch(`${API_ENDPOINTS.NOTIFICATIONS}?audience=${audience}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'mark_read', key }),
      });
      const data = (await response.json()) as NotificationsResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to mark notification as read');
      }
      if (data.data) {
        setNotifications(data.data.notifications || []);
        setUnreadCount(Number(data.data.unread_count || 0));
        onSnapshot?.(data.data);
      }
      window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', { detail: { audience } }));
    } catch {
      void fetchNotifications(true);
    }
  };

  const markAllRead = async () => {
    if (notifications.length === 0) return;

    setMarkingAll(true);
    const keys = notifications.map((notification) => notification.key);
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    setUnreadCount(0);

    try {
      const response = await fetch(`${API_ENDPOINTS.NOTIFICATIONS}?audience=${audience}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'mark_all_read', keys }),
      });
      const data = (await response.json()) as NotificationsResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to mark notifications as read');
      }
      if (data.data) {
        setNotifications(data.data.notifications || []);
        setUnreadCount(Number(data.data.unread_count || 0));
        onSnapshot?.(data.data);
      }
      window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', { detail: { audience } }));
    } catch {
      void fetchNotifications(true);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = (notification: NotificationItem) => {
    if (!notification.read) {
      void markRead(notification.key);
    }

    setOpen(false);

    if (notification.link) {
      navigate(notification.link);
    }
  };

  const buttonClass =
    colorScheme === 'dark'
      ? 'border-transparent text-white hover:border-white/10 hover:bg-white/10 focus:ring-white/40'
      : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900 focus:ring-blue-500/30 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white';
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div className={`relative flex-none overflow-visible ${className}`} ref={wrapperRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          void fetchNotifications(true);
        }}
        className={`relative inline-flex h-11 w-11 flex-none items-center justify-center overflow-visible rounded-full border transition-[background-color,border-color,color,box-shadow] duration-[250ms] ease-out focus:outline-none focus:ring-2 ${buttonClass} ${open ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-200' : ''}`}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
              {unreadLabel}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          className="fixed left-1/2 top-[4.25rem] z-50 flex max-h-[calc(100dvh-5rem)] w-[calc(100vw-1.5rem)] max-w-[440px] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[440px] sm:max-w-[calc(100vw-1.5rem)] sm:translate-x-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex flex-none items-center justify-between gap-3 border-b border-gray-100 px-3 py-3 sm:px-4 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Notifications</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll || unreadCount === 0}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent dark:text-blue-300 dark:hover:bg-blue-950/50 dark:disabled:text-slate-600"
            >
              {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Mark read
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain sm:max-h-[420px]">
            {loading && (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notifications...
              </div>
            )}

            {!loading && error && (
              <div className="px-4 py-6 text-sm text-red-600">
                {error}
              </div>
            )}

            {!loading && !error && notifications.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-gray-800 dark:text-slate-100">No notifications yet</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">New activity will appear here.</p>
              </div>
            )}

            {!loading && !error && notifications.map((notification) => {
              const style = typeStyles[notification.type] || typeStyles.user;

              return (
                <button
                  type="button"
                  key={notification.key}
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex min-w-0 w-full gap-2.5 border-b border-gray-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-gray-50 sm:gap-3 sm:px-4 dark:border-slate-800 dark:hover:bg-slate-800/70 ${
                    notification.read ? 'bg-white dark:bg-slate-900' : 'bg-blue-50/80 dark:bg-blue-950/35'
                  }`}
                >
                  <span className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${notification.read ? 'bg-gray-300 dark:bg-slate-600' : 'bg-blue-600 ring-2 ring-blue-100 dark:bg-blue-400 dark:ring-blue-950'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 max-w-full flex-1 basis-40 break-words text-sm font-semibold text-gray-900 [overflow-wrap:anywhere] dark:text-slate-100">{notification.title}</span>
                      <span className={`max-w-full shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize [overflow-wrap:anywhere] ${style}`}>
                        {formatNotificationType(notification.type)}
                      </span>
                    </span>
                    <span className="mt-1 block break-words text-sm leading-5 text-gray-600 [overflow-wrap:anywhere] dark:text-slate-300">{notification.message}</span>
                    <span className="mt-2 block text-xs text-gray-500 dark:text-slate-400">{formatRelativeTime(notification.created_at)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
