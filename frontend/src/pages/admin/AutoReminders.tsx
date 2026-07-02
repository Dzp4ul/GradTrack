import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Mail,
  Send,
  RefreshCw,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  History,
  Loader2,
  Settings2,
  Calendar,
} from 'lucide-react';
import MessageBox from '../../components/MessageBox';
import { API_ENDPOINTS } from '../../config/api';

const FREQUENCY_OPTIONS = [
  { value: '3', label: 'Every 3 Days' },
  { value: '7', label: 'Every Week (7 Days)' },
  { value: '14', label: 'Every 2 Weeks (14 Days)' },
  { value: '30', label: 'Every Month (30 Days)' },
];

interface ReminderStats {
  total_sent: number;
  total_failed: number;
  total_skipped: number;
  auto_sent: number;
  manual_sent: number;
  last_run: string | null;
}

interface StatusData {
  active_survey: {
    id: number;
    title: string;
    status: string;
  } | null;
  eligible_count: number;
  interval_days: number;
  email_enabled: boolean;
  stats: ReminderStats;
}

interface LogEntry {
  id: number;
  survey_id: number;
  graduate_id: number;
  email: string;
  subject: string;
  reminder_type: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  survey_title: string | null;
  first_name: string | null;
  last_name: string | null;
}

type TabType = 'dashboard' | 'send' | 'logs' | 'settings';

export default function AutoReminders() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [eligibleList, setEligibleList] = useState<Array<{ id: number; first_name: string; last_name: string; email: string; program_code: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [intervalDays, setIntervalDays] = useState(3);
  const [subject, setSubject] = useState('Reminder: Complete your Graduate Tracer Study Survey');
  const [message, setMessage] = useState('Please complete the Graduate Tracer Study Survey. Your response helps Norzagaray College improve its programs and support graduates with better alumni services.');
  const [showEligibleList, setShowEligibleList] = useState(false);
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'confirm' | 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'info', message: '' });

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.SUPER_ADMIN.AUTO_REMINDERS}?action=status`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setStatusData(data.data);
        setIntervalDays(data.data.interval_days || 3);
      }
    } catch (error) {
      console.error('Failed to fetch reminder status:', error);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.SUPER_ADMIN.AUTO_REMINDERS}?action=logs&limit=50`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setLogs(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch reminder logs:', error);
    }
  }, []);

  const fetchEligible = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.SUPER_ADMIN.AUTO_REMINDERS}?action=eligible`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setEligibleList(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch eligible graduates:', error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStatus(), fetchLogs()]).finally(() => setLoading(false));
  }, [fetchStatus, fetchLogs]);

  const handleSendReminders = async () => {
    setSending(true);
    try {
      const response = await fetch(API_ENDPOINTS.SUPER_ADMIN.AUTO_REMINDERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'send_reminders',
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
          reminder_type: 'auto',
        }),
      });
      const data = await response.json();

      if (response.ok) {
        const counts = data.counts || { sent: 0, failed: 0, skipped: 0, eligible: 0 };
        setMsgBox({
          isOpen: true,
          type: counts.failed > 0 ? 'warning' : 'success',
          title: counts.failed > 0 ? 'Emails Finished With Issues' : 'Emails Sent',
          message:
            `Eligible: ${counts.eligible}\n` +
            `Sent: ${counts.sent}\n` +
            `Skipped: ${counts.skipped}\n` +
            `Failed: ${counts.failed}`,
        });
        await Promise.all([fetchStatus(), fetchLogs()]);
      } else {
        setMsgBox({
          isOpen: true,
          type: 'error',
          message: data.error || 'Unable to send reminder emails',
        });
      }
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to send reminder emails',
      });
    } finally {
      setSending(false);
    }
  };

  const handleUpdateSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch(API_ENDPOINTS.SUPER_ADMIN.AUTO_REMINDERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_settings',
          interval_days: intervalDays,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setMsgBox({
          isOpen: true,
          type: 'success',
          message: `Auto-reminder frequency updated to every ${intervalDays} day(s).`,
        });
        await fetchStatus();
      } else {
        setMsgBox({
          isOpen: true,
          type: 'error',
          message: data.error || 'Failed to update settings',
        });
      }
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmSend = () => {
    if (!statusData?.active_survey) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'No active survey found. Please activate a survey first.',
      });
      return;
    }

    if (!statusData.email_enabled) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        message: 'Email notifications are disabled. Enable them in System Settings first.',
      });
      return;
    }

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Send Reminder Emails',
      message: `Send reminder emails to all ${statusData.eligible_count} eligible graduate(s) who haven't answered "${statusData.active_survey.title}"?`,
      confirmText: 'Send Emails',
      onConfirm: () => void handleSendReminders(),
    });
  };

  const tabs: Array<{ id: TabType; label: string; icon: ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'send', label: 'Send Reminders', icon: <Send className="w-4 h-4" /> },
    { id: 'settings', label: 'Frequency', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'logs', label: 'History', icon: <History className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-7 w-7 text-blue-900" />
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Auto Email Reminders</h1>
            <p className="text-sm text-gray-500 mt-1">
              Send automated survey reminders to graduates who haven't answered
            </p>
          </div>
        </div>
        <button
          onClick={() => { void fetchStatus(); void fetchLogs(); }}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'logs') void fetchLogs();
              if (tab.id === 'dashboard') void fetchStatus();
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-blue-900 text-blue-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Dashboard */}
      {activeTab === 'dashboard' && statusData && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatusCard
              icon={<Mail className="w-5 h-5 text-blue-700" />}
              label="Active Survey"
              value={statusData.active_survey?.title || 'No Active Survey'}
              subtext={statusData.active_survey ? `Status: ${statusData.active_survey.status}` : 'Activate a survey first'}
              cardClass="bg-blue-50 border-blue-200"
            />
            <StatusCard
              icon={<Users className="w-5 h-5 text-purple-700" />}
              label="Eligible Graduates"
              value={String(statusData.eligible_count)}
              subtext="Haven't answered the survey"
              cardClass="bg-purple-50 border-purple-200"
            />
            <StatusCard
              icon={<Clock className="w-5 h-5 text-amber-700" />}
              label="Reminder Frequency"
              value={statusData.interval_days === 1 ? 'Every Day' : `Every ${statusData.interval_days} Days`}
              subtext={statusData.email_enabled ? 'Emails enabled' : 'Emails disabled'}
              cardClass="bg-amber-50 border-amber-200"
            />
            <StatusCard
              icon={<BarChart3 className="w-5 h-5 text-green-700" />}
              label="Total Sent"
              value={String(statusData.stats.total_sent)}
              subtext={`${statusData.stats.auto_sent} auto · ${statusData.stats.manual_sent} manual`}
              cardClass="bg-green-50 border-green-200"
            />
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide mb-4">Detailed Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatItem label="Sent" value={statusData.stats.total_sent} color="text-green-700" />
              <StatItem label="Failed" value={statusData.stats.total_failed} color="text-red-700" />
              <StatItem label="Skipped" value={statusData.stats.total_skipped} color="text-amber-700" />
              <StatItem
                label="Last Run"
                value={statusData.stats.last_run
                  ? new Date(statusData.stats.last_run).toLocaleDateString()
                  : 'Never'}
                color="text-gray-700"
              />
            </div>
          </div>

          {/* Eligible Graduates Preview */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <button
              onClick={() => {
                setShowEligibleList(!showEligibleList);
                if (!showEligibleList && eligibleList.length === 0) void fetchEligible();
              }}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide">
                Eligible Graduates ({statusData.eligible_count})
              </h3>
              {showEligibleList ? (
                <span className="text-xs text-blue-600 font-medium">Hide list</span>
              ) : (
                <span className="text-xs text-blue-600 font-medium">Show list</span>
              )}
            </button>
            {showEligibleList && (
              <div className="border-t max-h-80 overflow-y-auto">
                {eligibleList.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading eligible graduates...
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Name</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Email</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Program</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleList.map((grad) => (
                        <tr key={grad.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">
                            {grad.last_name}, {grad.first_name}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{grad.email}</td>
                          <td className="px-4 py-2.5">
                            <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded">
                              {grad.program_code || '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Send Reminders */}
      {activeTab === 'send' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Send className="w-5 h-5 text-blue-900" />
              <h3 className="text-lg font-bold text-blue-900">Send Manual Reminders</h3>
            </div>

            {statusData?.active_survey ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900 font-semibold">
                  Active Survey: {statusData.active_survey.title}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  {statusData.eligible_count} eligible graduate(s) haven't answered yet
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-amber-800 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  No Active Survey
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Set a survey to 'Active' status before sending reminders.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Reminder: Complete your Graduate Tracer Study Survey"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Enter your message text..."
              />
            </div>

            <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              This will send to all {statusData?.eligible_count || 0} eligible graduate(s) who haven't answered the active survey.
            </div>

            <button
              onClick={confirmSend}
              disabled={sending || !statusData?.active_survey || statusData.eligible_count === 0}
              className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Reminders ({statusData?.eligible_count || 0})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Frequency Settings */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-5 h-5 text-blue-900" />
              <h3 className="text-lg font-bold text-blue-900">Reminder Frequency</h3>
            </div>

            <p className="text-sm text-gray-600">
              Configure how often automatic reminder emails are sent to graduates who haven't answered the survey.
              The system uses a cron job or scheduled task to process reminders based on this interval.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Important
              </p>
              <p className="text-xs text-amber-700 mt-1">
                For automatic reminders to work on a schedule, you need to set up a cron job or scheduled task
                that runs <code className="bg-amber-100 px-1 rounded">backend/api/surveys/auto-reminders.php</code> with the
                appropriate <code className="bg-amber-100 px-1 rounded">SURVEY_REMINDER_CRON_SECRET</code>.
                This page allows you to manually send reminders and configure the interval.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Reminder Interval</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setIntervalDays(parseInt(option.value))}
                    className={`text-left p-4 rounded-lg border-2 transition-all ${
                      intervalDays === parseInt(option.value)
                        ? 'border-blue-900 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        intervalDays === parseInt(option.value)
                          ? 'border-blue-900'
                          : 'border-gray-400'
                      }`}>
                        {intervalDays === parseInt(option.value) && (
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-900" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{option.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Sends reminders every {option.value} days to pending graduates
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Custom Interval (Days)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
                  className="w-32 border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">day(s)</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => void handleUpdateSettings()}
                disabled={saving}
                className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Settings2 className="w-4 h-4" />
                    Save Frequency
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-900" />
              <h3 className="text-lg font-bold text-blue-900">Reminder History</h3>
            </div>
            <button
              onClick={() => void fetchLogs()}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-gray-500">
              <History className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-sm font-medium">No reminder logs yet</p>
              <p className="text-xs mt-1">Send your first reminder to see history here</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Graduate</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Survey</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                        {log.sent_at
                          ? new Date(log.sent_at).toLocaleString()
                          : new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-800">
                          {log.last_name ? `${log.last_name}, ${log.first_name}` : `#${log.graduate_id}`}
                        </p>
                        <p className="text-xs text-gray-500">{log.email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{log.survey_title || `#${log.survey_id}`}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          log.reminder_type === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {log.reminder_type === 'auto' ? 'Auto' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          log.status === 'sent' ? 'bg-green-100 text-green-700'
                          : log.status === 'failed' ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {log.status === 'sent' ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : null}
                          {log.status === 'failed' ? <XCircle className="w-3 h-3 inline mr-1" /> : null}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-red-600 text-xs max-w-[200px] truncate" title={log.error_message || ''}>
                        {log.error_message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
      />
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  subtext,
  cardClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtext: string;
  cardClass: string;
}) {
  return (
    <div className={`rounded-xl border p-5 ${cardClass}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {icon}
      </div>
      <p className="text-lg font-bold text-gray-800 truncate" title={value}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{subtext}</p>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="text-center p-3 bg-gray-50 rounded-lg">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}