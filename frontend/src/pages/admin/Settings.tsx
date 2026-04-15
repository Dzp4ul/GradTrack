import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, Save, Settings2, ShieldCheck } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';

interface Setting {
  id?: number;
  setting_key: string;
  setting_value: string;
  setting_group: string;
  updated_at?: string;
}

type SettingType = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'boolean';

interface SettingDefinition {
  key: string;
  group: string;
  label: string;
  description: string;
  type: SettingType;
  defaultValue: string;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  unit?: string;
  options?: Array<{ value: string; label: string }>;
}

const groupDetails: Record<string, { title: string; description: string }> = {
  institution: {
    title: 'Institution Profile',
    description: 'Public identity, contact details, and campus information used across GradTrack.',
  },
  academic: {
    title: 'Academic Cycle',
    description: 'Current academic period and tracer batch defaults for reports and survey operations.',
  },
  surveys: {
    title: 'Survey Operations',
    description: 'Controls that guide tracer survey deadlines, reminders, and graduate access.',
  },
  notifications: {
    title: 'Notifications',
    description: 'Email sender and alert preferences for surveys and administrator updates.',
  },
  security: {
    title: 'Security & Access',
    description: 'Operational safeguards for sign-ins, maintenance work, and account policies.',
  },
  data: {
    title: 'Data Governance',
    description: 'Retention and backup reminders for long-term system maintenance.',
  },
};

const settingDefinitions: SettingDefinition[] = [
  {
    key: 'institution_name',
    group: 'institution',
    label: 'Institution Name',
    description: 'Official school name displayed in portals and generated reports.',
    type: 'text',
    defaultValue: 'Norzagaray College',
    required: true,
  },
  {
    key: 'institution_address',
    group: 'institution',
    label: 'Institution Address',
    description: 'Campus address used for official report headers and contact references.',
    type: 'textarea',
    defaultValue: 'Norzagaray, Bulacan',
    required: true,
  },
  {
    key: 'site_name',
    group: 'institution',
    label: 'System Name',
    description: 'Name shown to administrators and graduates.',
    type: 'text',
    defaultValue: 'GradTrack - Norzagaray College',
    required: true,
  },
  {
    key: 'site_description',
    group: 'institution',
    label: 'System Description',
    description: 'Short description used anywhere the application needs a system summary.',
    type: 'textarea',
    defaultValue: 'Graduate Tracer System',
  },
  {
    key: 'contact_email',
    group: 'institution',
    label: 'Support Email',
    description: 'Primary email for graduate and administrator support.',
    type: 'email',
    defaultValue: 'norzagaraycollege2007@gmail.com',
    required: true,
  },
  {
    key: 'contact_phone',
    group: 'institution',
    label: 'Support Phone',
    description: 'Optional phone number for account or tracer survey concerns.',
    type: 'tel',
    defaultValue: '',
    placeholder: 'Example: 0917 123 4567',
  },
  {
    key: 'academic_year',
    group: 'academic',
    label: 'Academic Year',
    description: 'Current academic year used as the default reporting period.',
    type: 'text',
    defaultValue: '2025-2026',
    required: true,
    placeholder: '2025-2026',
  },
  {
    key: 'active_semester',
    group: 'academic',
    label: 'Active Semester',
    description: 'Default semester for administrator filtering and survey preparation.',
    type: 'select',
    defaultValue: '1st Semester',
    options: [
      { value: '1st Semester', label: '1st Semester' },
      { value: '2nd Semester', label: '2nd Semester' },
      { value: 'Summer', label: 'Summer' },
    ],
  },
  {
    key: 'current_tracer_batch',
    group: 'academic',
    label: 'Tracer Batch',
    description: 'Graduate batch currently prioritized for tracer follow-up.',
    type: 'text',
    defaultValue: 'Batch 2025',
    required: true,
    placeholder: 'Batch 2025',
  },
  {
    key: 'default_graduation_year',
    group: 'academic',
    label: 'Default Graduation Year',
    description: 'Prefills year-based filters and graduate import defaults.',
    type: 'number',
    defaultValue: '2025',
    min: 1990,
    max: 2100,
  },
  {
    key: 'survey_reminder_days',
    group: 'surveys',
    label: 'Reminder Interval',
    description: 'Days between tracer survey reminder cycles.',
    type: 'number',
    defaultValue: '30',
    min: 1,
    max: 365,
    unit: 'days',
  },
  {
    key: 'survey_token_expiry_days',
    group: 'surveys',
    label: 'Survey Link Expiry',
    description: 'How long graduate survey links remain valid after sending.',
    type: 'number',
    defaultValue: '60',
    min: 1,
    max: 365,
    unit: 'days',
  },
  {
    key: 'allow_late_survey_responses',
    group: 'surveys',
    label: 'Allow Late Responses',
    description: 'Keeps survey links usable after the target response period for manual follow-up.',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'auto_close_inactive_surveys',
    group: 'surveys',
    label: 'Auto-close Inactive Surveys',
    description: 'Marks old survey campaigns for review when no responses arrive for a long period.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    key: 'enable_email_notifications',
    group: 'notifications',
    label: 'Email Notifications',
    description: 'Master switch for outgoing survey and system email notifications.',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'notify_admin_on_survey_response',
    group: 'notifications',
    label: 'Response Alerts',
    description: 'Notify administrators when graduates submit tracer survey responses.',
    type: 'boolean',
    defaultValue: 'true',
  },
  {
    key: 'reminder_sender_name',
    group: 'notifications',
    label: 'Sender Name',
    description: 'Display name used for tracer reminders and graduate outreach.',
    type: 'text',
    defaultValue: 'GradTrack Support',
    required: true,
  },
  {
    key: 'maintenance_mode',
    group: 'security',
    label: 'Maintenance Mode',
    description: 'Flags scheduled repair or data cleanup work for system operators.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    key: 'session_timeout_minutes',
    group: 'security',
    label: 'Session Timeout',
    description: 'Recommended idle time before administrator sessions should be refreshed.',
    type: 'number',
    defaultValue: '60',
    min: 5,
    max: 480,
    unit: 'minutes',
  },
  {
    key: 'minimum_password_length',
    group: 'security',
    label: 'Minimum Password Length',
    description: 'Baseline password length for newly created administrator accounts.',
    type: 'number',
    defaultValue: '8',
    min: 8,
    max: 64,
    unit: 'characters',
  },
  {
    key: 'backup_reminder_days',
    group: 'data',
    label: 'Backup Reminder',
    description: 'How often super admins should create a fresh database backup.',
    type: 'number',
    defaultValue: '7',
    min: 1,
    max: 90,
    unit: 'days',
  },
  {
    key: 'data_retention_years',
    group: 'data',
    label: 'Graduate Data Retention',
    description: 'Suggested retention window for graduate tracer records.',
    type: 'number',
    defaultValue: '10',
    min: 1,
    max: 50,
    unit: 'years',
  },
  {
    key: 'audit_log_retention_days',
    group: 'data',
    label: 'Audit Log Retention',
    description: 'Suggested number of days to retain operational logs and exports.',
    type: 'number',
    defaultValue: '365',
    min: 30,
    max: 3650,
    unit: 'days',
  },
];

const definitionsByKey = settingDefinitions.reduce<Record<string, SettingDefinition>>((acc, definition) => {
  acc[definition.key] = definition;
  return acc;
}, {});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Settings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const settingsByKey = useMemo(() => {
    return settings.reduce<Record<string, Setting>>((acc, setting) => {
      acc[setting.setting_key] = setting;
      return acc;
    }, {});
  }, [settings]);

  const groupedDefinitions = useMemo(() => {
    return Object.keys(groupDetails).map((group) => ({
      group,
      definitions: settingDefinitions.filter((definition) => definition.group === group),
    }));
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(API_ENDPOINTS.SETTINGS, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load settings');
      }

      setSettings(mergeWithDefaults(data.data || []));
      setSaved(false);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load settings');
      setSettings(mergeWithDefaults([]));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateValue = (key: string, value: string) => {
    const definition = definitionsByKey[key];
    if (!definition) return;

    setSettings((prev) => {
      const exists = prev.some((setting) => setting.setting_key === key);
      const nextSetting: Setting = {
        setting_key: key,
        setting_value: value,
        setting_group: definition.group,
      };

      if (!exists) {
        return [...prev, nextSetting];
      }

      return prev.map((setting) =>
        setting.setting_key === key
          ? { ...setting, setting_value: value, setting_group: definition.group }
          : setting
      );
    });
    setSaved(false);
    setError('');
  };

  const validateSettings = () => {
    for (const definition of settingDefinitions) {
      const value = (settingsByKey[definition.key]?.setting_value ?? definition.defaultValue).trim();

      if (definition.required && value === '') {
        return `${definition.label} is required.`;
      }

      if (definition.type === 'email' && value !== '' && !emailPattern.test(value)) {
        return `${definition.label} must be a valid email address.`;
      }

      if (definition.type === 'number') {
        const numericValue = Number(value);
        if (value === '' || Number.isNaN(numericValue)) {
          return `${definition.label} must be a number.`;
        }
        if (definition.min !== undefined && numericValue < definition.min) {
          return `${definition.label} must be at least ${definition.min}.`;
        }
        if (definition.max !== undefined && numericValue > definition.max) {
          return `${definition.label} must be no more than ${definition.max}.`;
        }
      }
    }

    return '';
  };

  const handleSave = async () => {
    const validationError = validateSettings();
    if (validationError !== '') {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = settingDefinitions.map((definition) => ({
        setting_key: definition.key,
        setting_value: settingsByKey[definition.key]?.setting_value ?? definition.defaultValue,
        setting_group: definition.group,
      }));

      const response = await fetch(API_ENDPOINTS.SETTINGS, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings: payload }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save settings');
      }

      setSettings(mergeWithDefaults(data.data || payload));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#1b2a4a]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-[#1b2a4a]" />
            <h1 className="text-2xl font-bold text-[#1b2a4a]">System Settings</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Manage useful defaults for tracer operations, security, and data care.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={fetchSettings}
            className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> Reload
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[#1b2a4a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#263c66] disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Tracer Period"
          value={`${valueFor(settingsByKey, 'academic_year')} - ${valueFor(settingsByKey, 'active_semester')}`}
        />
        <SummaryTile
          label="Email Notifications"
          value={valueFor(settingsByKey, 'enable_email_notifications') === 'true' ? 'Enabled' : 'Disabled'}
        />
        <SummaryTile
          label="Reminder Interval"
          value={`${valueFor(settingsByKey, 'survey_reminder_days')} days`}
        />
        <SummaryTile
          label="Backup Reminder"
          value={`${valueFor(settingsByKey, 'backup_reminder_days')} days`}
        />
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Settings saved successfully.
        </div>
      )}

      {error !== '' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="space-y-6">
        {groupedDefinitions.map(({ group, definitions }) => {
          const detail = groupDetails[group];

          return (
            <section key={group} className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <div className="border-b bg-gray-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-[#1b2a4a]" />
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1b2a4a]">{detail.title}</h2>
                    <p className="mt-1 text-sm text-gray-500">{detail.description}</p>
                  </div>
                </div>
              </div>

              <div className="divide-y">
                {definitions.map((definition) => {
                  const setting = settingsByKey[definition.key];
                  const value = setting?.setting_value ?? definition.defaultValue;

                  return (
                    <SettingRow
                      key={definition.key}
                      definition={definition}
                      value={value}
                      onChange={(nextValue) => updateValue(definition.key, nextValue)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function mergeWithDefaults(apiSettings: Setting[]) {
  const rowsByKey = apiSettings.reduce<Record<string, Setting>>((acc, setting) => {
    acc[setting.setting_key] = setting;
    return acc;
  }, {});

  return settingDefinitions.map((definition) => ({
    ...rowsByKey[definition.key],
    setting_key: definition.key,
    setting_group: definition.group,
    setting_value: rowsByKey[definition.key]?.setting_value ?? definition.defaultValue,
  }));
}

function valueFor(settingsByKey: Record<string, Setting>, key: string) {
  const definition = definitionsByKey[key];
  return settingsByKey[key]?.setting_value ?? definition?.defaultValue ?? '';
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-[#1b2a4a]">{value}</p>
    </div>
  );
}

function SettingRow({
  definition,
  value,
  onChange,
}: {
  definition: SettingDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(320px,1.4fr)] lg:items-center">
      <div>
        <label htmlFor={definition.key} className="text-sm font-semibold text-gray-800">
          {definition.label}
        </label>
        <p className="mt-1 text-sm leading-5 text-gray-500">{definition.description}</p>
      </div>

      <div>
        {definition.type === 'boolean' ? (
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              id={definition.key}
              type="checkbox"
              checked={value === 'true'}
              onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
              className="peer sr-only"
            />
            <span className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white" />
            <span className="ml-3 text-sm font-medium text-gray-700">{value === 'true' ? 'Enabled' : 'Disabled'}</span>
          </label>
        ) : definition.type === 'textarea' ? (
          <textarea
            id={definition.key}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={definition.placeholder}
            rows={3}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : definition.type === 'select' ? (
          <select
            id={definition.key}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(definition.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <input
              id={definition.key}
              type={definition.type}
              value={value}
              min={definition.min}
              max={definition.max}
              onChange={(event) => onChange(event.target.value)}
              placeholder={definition.placeholder}
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {definition.unit && <span className="min-w-20 text-sm text-gray-500">{definition.unit}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
