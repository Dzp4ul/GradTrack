import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';

interface NotificationItem {
  key: string;
  type: string;
  title: string;
  message: string;
  created_at: string | null;
  link: string | null;
  priority: string;
  read: boolean;
}

interface NotificationsResponse {
  success: boolean;
  data?: {
    notifications: NotificationItem[];
    unread_count: number;
  };
  error?: string;
}

interface NotificationBellProps {
  audience: 'admin' | 'graduate';
  colorScheme?: 'light' | 'dark';
  className?: string;
  expandLabel?: boolean;
}

const typeStyles: Record<string, string> = {
  announcement: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  approval: 'bg-amber-50 text-amber-700 border-amber-200',
  forum: 'bg-blue-50 text-blue-700 border-blue-200',
  forum_comment: 'bg-blue-50 text-blue-700 border-blue-200',
  post_reaction: 'bg-rose-50 text-rose-700 border-rose-200',
  graduate: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  job_opportunity: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  response: 'bg-violet-50 text-violet-700 border-violet-200',
  survey: 'bg-rose-50 text-rose-700 border-rose-200',
  user: 'bg-slate-50 text-slate-700 border-slate-200',
};

const typeLabels: Record<string, string> = {
  forum_comment: 'Forum Comment',
  post_reaction: 'Post Reaction',
  job_opportunity: 'New Job',
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

export default function NotificationBell({ audience, colorScheme = 'light', className = '', expandLabel = false }: NotificationBellProps) {
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
      const response = await fetch(`${API_ENDPOINTS.NOTIFICATIONS}?limit=20&audience=${audience}`, {
        credentials: 'include',
      });
      const data = (await response.json()) as NotificationsResponse;

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Unable to load notifications');
      }

      setNotifications(Array.isArray(data.data.notifications) ? data.data.notifications : []);
      setUnreadCount(Number(data.data.unread_count || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    void fetchNotifications();
    const intervalId = window.setInterval(() => void fetchNotifications(true), 30000);
    return () => window.clearInterval(intervalId);
  }, [fetchNotifications]);

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
      await fetch(`${API_ENDPOINTS.NOTIFICATIONS}?audience=${audience}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'mark_read', key }),
      });
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
      await fetch(`${API_ENDPOINTS.NOTIFICATIONS}?audience=${audience}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'mark_all_read', keys }),
      });
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
  const unreadLabel = unreadCount > 9 ? '9+' : String(unreadCount);
  const expandedButtonClass = expandLabel
    ? 'w-11 justify-start hover:w-40 focus-visible:w-40'
    : 'w-11 justify-start';

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          void fetchNotifications(true);
        }}
        className={`group relative flex h-11 items-center overflow-hidden rounded-full border transition-[width,background-color,border-color,color,box-shadow] duration-[250ms] ease-out focus:outline-none focus:ring-2 ${buttonClass} ${open ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-200' : ''} ${expandedButtonClass}`}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-0 top-0 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
              {unreadLabel}
            </span>
          )}
        </span>
        {expandLabel && (
          <span className="min-w-0 max-w-0 -translate-x-1 overflow-hidden whitespace-nowrap pr-0 text-sm font-semibold opacity-0 transition-[max-width,opacity,transform,padding] duration-[250ms] ease-out group-hover:max-w-24 group-hover:translate-x-0 group-hover:pr-4 group-hover:opacity-100 group-focus-visible:max-w-24 group-focus-visible:translate-x-0 group-focus-visible:pr-4 group-focus-visible:opacity-100">
            Notifications
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Notifications</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll || unreadCount === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent dark:text-blue-300 dark:hover:bg-blue-950/50 dark:disabled:text-slate-600"
            >
              {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Mark read
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
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
                  className={`flex w-full gap-3 border-b border-gray-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/70 ${
                    notification.read ? 'bg-white dark:bg-slate-900' : 'bg-yellow-50/60 dark:bg-amber-950/20'
                  }`}
                >
                  <span className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${notification.read ? 'bg-gray-300' : 'bg-red-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{notification.title}</span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${style}`}>
                        {formatNotificationType(notification.type)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-gray-600 dark:text-slate-300">{notification.message}</span>
                    <span className="mt-2 block text-xs text-gray-400 dark:text-slate-500">{formatRelativeTime(notification.created_at)}</span>
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
