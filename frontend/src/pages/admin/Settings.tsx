import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Lock,
  Monitor,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  ToggleLeft,
  Upload,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import MessageBox from '../../components/MessageBox';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettingsMap,
  isTruthySetting,
  resolveSystemAssetUrl,
  useSystemSettings,
} from '../../contexts/SystemSettingsContext';

type SettingType = 'text' | 'email' | 'tel' | 'textarea' | 'boolean' | 'color' | 'image';
type SettingsTab = 'general' | 'branding' | 'login' | 'features' | 'survey' | 'community' | 'maintenance';

interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  placeholder?: string;
  rows?: number;
  imageType?: 'system_logo' | 'login_logo' | 'favicon' | 'login_background';
  accept?: string;
}

interface MessageState {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
}

type SaveModalPhase = 'idle' | 'saving' | 'success' | 'error';

interface SaveModalState {
  phase: SaveModalPhase;
  progress: number;
  message?: string;
}

const tabConfig: Array<{ key: SettingsTab; label: string; icon: LucideIcon; description: string }> = [
  { key: 'general', label: 'General', icon: Building2, description: 'System identity and contact information.' },
  { key: 'branding', label: 'Branding', icon: Palette, description: 'Logos, favicon, and theme colors.' },
  { key: 'login', label: 'Login Page', icon: Monitor, description: 'Sign-in copy, logo, background, and live preview.' },
  { key: 'features', label: 'Features', icon: SlidersHorizontal, description: 'Enable or disable graduate-facing modules.' },
  { key: 'survey', label: 'Survey', icon: ShieldCheck, description: 'Tracer survey messaging and availability.' },
  { key: 'community', label: 'Community', icon: Users, description: 'Forum availability, guidelines, and announcement text.' },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench, description: 'Maintenance access controls and blocked-user page copy.' },
];

const definitionsByTab: Record<SettingsTab, SettingDefinition[]> = {
  general: [
    { key: 'system_name', label: 'System Name', description: 'Full system name used on public and administrative surfaces.', type: 'text' },
    { key: 'system_short_name', label: 'System Short Name', description: 'Compact name shown in navigation and browser titles.', type: 'text' },
    { key: 'institution_name', label: 'Institution Name', description: 'Official institution name displayed across GradTrack.', type: 'text' },
    { key: 'system_description', label: 'System Description', description: 'Short public description of the system purpose.', type: 'textarea', rows: 3 },
    { key: 'contact_email', label: 'Contact Email', description: 'Primary public support email.', type: 'email' },
    { key: 'contact_number', label: 'Contact Number', description: 'Optional public contact number.', type: 'tel' },
    { key: 'institution_address', label: 'Institution Address', description: 'Institution location shown in public footer/contact areas.', type: 'textarea', rows: 3 },
    { key: 'footer_text', label: 'Footer Text', description: 'Short footer statement used on public pages.', type: 'textarea', rows: 2 },
    { key: 'copyright_text', label: 'Copyright Text', description: 'Copyright line shown in the public footer.', type: 'text' },
  ],
  branding: [
    { key: 'system_logo_path', label: 'System Logo', description: 'Logo used in navigation and maintenance pages.', type: 'image', imageType: 'system_logo', accept: 'image/png,image/jpeg,image/webp,image/gif' },
    { key: 'login_logo_path', label: 'Login Logo', description: 'Logo used on administrator and graduate sign-in pages.', type: 'image', imageType: 'login_logo', accept: 'image/png,image/jpeg,image/webp,image/gif' },
    { key: 'favicon_path', label: 'Favicon', description: 'Small browser tab icon. ICO or square PNG recommended.', type: 'image', imageType: 'favicon', accept: 'image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon' },
    { key: 'primary_theme_color', label: 'Primary Theme Color', description: 'Primary action and active navigation color.', type: 'color' },
    { key: 'secondary_theme_color', label: 'Secondary / Accent Color', description: 'Accent color used for highlights and supporting actions.', type: 'color' },
  ],
  login: [
    { key: 'login_page_title', label: 'Login Page Title', description: 'Main heading shown on the administrator sign-in page.', type: 'text' },
    { key: 'login_welcome_message', label: 'Welcome Message', description: 'Short welcome line below the login title.', type: 'text' },
    { key: 'login_subtitle', label: 'Subtitle', description: 'Supporting message shown in the login brand panel.', type: 'textarea', rows: 3 },
    { key: 'login_logo_path', label: 'Login Logo', description: 'Logo shown above the login form.', type: 'image', imageType: 'login_logo', accept: 'image/png,image/jpeg,image/webp,image/gif' },
    { key: 'login_background_image_path', label: 'Background Image', description: 'Background image for login and public entry screens.', type: 'image', imageType: 'login_background', accept: 'image/png,image/jpeg,image/webp,image/gif' },
    { key: 'additional_login_text', label: 'Additional Login Text', description: 'Optional note shown below the login subtitle.', type: 'textarea', rows: 3 },
  ],
  features: [
    { key: 'feature_graduate_survey_enabled', label: 'Graduate Tracer Survey', description: 'Allow graduates to verify and answer active tracer surveys.', type: 'boolean' },
    { key: 'feature_alumni_job_support_enabled', label: 'Alumni Job Support', description: 'Allow graduates to browse approved job opportunities and submit job posts when eligible.', type: 'boolean' },
    { key: 'feature_community_forum_enabled', label: 'Community Forum', description: 'Allow graduates to use forum discussions and related community features.', type: 'boolean' },
    { key: 'feature_messaging_enabled', label: 'Messages and Group Chats', description: 'Allow graduate direct messages and group chats inside the portal.', type: 'boolean' },
    { key: 'feature_notifications_enabled', label: 'Notifications', description: 'Show notification controls and bells for users.', type: 'boolean' },
  ],
  survey: [
    { key: 'survey_title', label: 'Survey Title', description: 'Public-facing title for the tracer survey entry point.', type: 'text' },
    { key: 'survey_instructions', label: 'Survey Instructions', description: 'Instructions shown before graduates verify their identity.', type: 'textarea', rows: 4 },
    { key: 'survey_enabled', label: 'Enable Survey', description: 'Operational switch for the tracer survey flow.', type: 'boolean' },
    { key: 'survey_availability_message', label: 'Survey Availability Message', description: 'Message shown when survey access is disabled.', type: 'textarea', rows: 3 },
    { key: 'survey_completion_message', label: 'Default Completion Message', description: 'Message shown after successful survey submission.', type: 'textarea', rows: 3 },
  ],
  community: [
    { key: 'community_forum_enabled', label: 'Enable Community Forum', description: 'Operational switch for the graduate community forum.', type: 'boolean' },
    { key: 'community_guidelines', label: 'Community Guidelines', description: 'Guidelines shown in the graduate community experience.', type: 'textarea', rows: 5 },
    { key: 'community_default_announcement', label: 'Default Community Announcement', description: 'Default message shown in the community dashboard.', type: 'textarea', rows: 3 },
    { key: 'community_allow_media_uploads', label: 'Allow Forum Media Uploads', description: 'Allow graduates to attach images or videos to community posts.', type: 'boolean' },
  ],
  maintenance: [
    { key: 'maintenance_mode', label: 'Maintenance Mode', description: 'Block regular users from normal pages while preserving Super Admin access.', type: 'boolean' },
    { key: 'maintenance_page_title', label: 'Maintenance Page Title', description: 'Heading shown to blocked users.', type: 'text' },
    { key: 'maintenance_message', label: 'Maintenance Message', description: 'Main message shown while maintenance mode is enabled.', type: 'textarea', rows: 4 },
    { key: 'maintenance_expected_availability_message', label: 'Expected Availability Message', description: 'Optional timing or follow-up note for blocked users.', type: 'text' },
  ],
};

const editableKeys = Array.from(new Set(Object.values(definitionsByTab).flat().map((definition) => definition.key)));
const imageDefinitions = Object.values(definitionsByTab)
  .flat()
  .filter((definition): definition is SettingDefinition & { imageType: NonNullable<SettingDefinition['imageType']> } => definition.type === 'image' && !!definition.imageType);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapFromApiResponse(data: Record<string, unknown>): SystemSettingsMap {
  if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) {
    return mergeSettings(data.settings as SystemSettingsMap);
  }

  const rows = Array.isArray(data.data) ? data.data : [];
  const mapped: SystemSettingsMap = {};
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const setting = row as { setting_key?: string; setting_value?: string };
    if (setting.setting_key) {
      mapped[setting.setting_key] = String(setting.setting_value ?? '');
    }
  });

  return mergeSettings(mapped);
}

function mergeSettings(settings: SystemSettingsMap): SystemSettingsMap {
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...settings,
  };
}

function contrastRatio(hex: string, textHex: string) {
  const first = relativeLuminance(hex);
  const second = relativeLuminance(textHex);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(hex: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '1d4ed8';
  const channels = [0, 2, 4].map((index) => {
    const channel = parseInt(normalized.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<SystemSettingsMap>(() => mergeSettings({}));
  const [draft, setDraft] = useState<SystemSettingsMap>(() => mergeSettings({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveModal, setSaveModal] = useState<SaveModalState>({ phase: 'idle', progress: 0 });
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Record<string, File | null>>({});
  const [uploadPreviews, setUploadPreviews] = useState<Record<string, string>>({});
  const [msgBox, setMsgBox] = useState<MessageState>({
    isOpen: false,
    type: 'info',
    message: '',
  });
  const { refresh } = useSystemSettings();

  const activeDefinitions = definitionsByTab[activeTab];
  const activeDetails = tabConfig.find((tab) => tab.key === activeTab) || tabConfig[0];
  const ActiveTabIcon = activeDetails.icon;
  const primaryContrast = contrastRatio(draft.primary_theme_color || DEFAULT_SYSTEM_SETTINGS.primary_theme_color, '#ffffff');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const response = await fetch(API_ENDPOINTS.SETTINGS, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load system settings');
      }

      const nextSettings = mapFromApiResponse(data);
      setSettings(nextSettings);
      setDraft(nextSettings);
      clearUploadPreviews();
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load system settings',
      });
      setSettings(mergeSettings({}));
      setDraft(mergeSettings({}));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  useEffect(() => () => clearUploadPreviews(), []);

  useEffect(() => {
    if (saveModal.phase !== 'saving') return undefined;

    const interval = window.setInterval(() => {
      setSaveModal((current) => {
        if (current.phase !== 'saving') return current;

        const nextProgress = current.progress + Math.max(0.8, (94 - current.progress) * 0.08);
        return { ...current, progress: Math.min(94, nextProgress) };
      });
    }, 180);

    return () => window.clearInterval(interval);
  }, [saveModal.phase]);

  useEffect(() => {
    if (saveModal.phase !== 'success') return undefined;

    const timeout = window.setTimeout(() => {
      setSaveModal({ phase: 'idle', progress: 0 });
    }, 1300);

    return () => window.clearTimeout(timeout);
  }, [saveModal.phase]);

  const updateDraft = (key: string, value: string) => {
    if (saving) return;

    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  };

  const handleToggle = (definition: SettingDefinition, checked: boolean) => {
    if (saving) return;

    if (definition.key === 'maintenance_mode' && checked && !isTruthySetting(draft.maintenance_mode, false)) {
      setMsgBox({
        isOpen: true,
        type: 'confirm',
        title: 'Enable Maintenance Mode?',
        message: 'Regular users may temporarily lose access to GradTrack. Super Admin access will remain available.',
        confirmText: 'Enable Maintenance Mode',
        cancelText: 'Cancel',
        onConfirm: () => updateDraft('maintenance_mode', 'true'),
      });
      return;
    }

    updateDraft(definition.key, checked ? 'true' : 'false');
  };

  const handleFileChange = (definition: SettingDefinition, event: ChangeEvent<HTMLInputElement>) => {
    if (saving) return;

    const file = event.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setPendingUploads((current) => ({ ...current, [definition.key]: file }));
    setUploadPreviews((current) => {
      if (current[definition.key]) URL.revokeObjectURL(current[definition.key]);
      return { ...current, [definition.key]: previewUrl };
    });
    setNotice(null);
  };

  const removeImage = (definition: SettingDefinition) => {
    if (saving) return;

    setPendingUploads((current) => ({ ...current, [definition.key]: null }));
    setUploadPreviews((current) => {
      if (current[definition.key]) URL.revokeObjectURL(current[definition.key]);
      const next = { ...current };
      delete next[definition.key];
      return next;
    });
    updateDraft(definition.key, '');
  };

  const resetSetting = (key: string) => {
    if (saving) return;

    updateDraft(key, DEFAULT_SYSTEM_SETTINGS[key] || '');
    setPendingUploads((current) => ({ ...current, [key]: null }));
    setUploadPreviews((current) => {
      if (current[key]) URL.revokeObjectURL(current[key]);
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const resetCurrentTab = () => {
    if (saving) return;

    activeDefinitions.forEach((definition) => resetSetting(definition.key));
  };

  const cancelChanges = () => {
    if (saving) return;

    setDraft(settings);
    clearUploadPreviews();
    setPendingUploads({});
    setNotice(null);
  };

  const validateDraft = () => {
    for (const definition of Object.values(definitionsByTab).flat()) {
      const value = (draft[definition.key] ?? '').trim();

      if (['system_name', 'system_short_name', 'institution_name', 'login_page_title'].includes(definition.key) && value === '') {
        return `${definition.label} is required.`;
      }

      if (definition.type === 'email' && value !== '' && !emailPattern.test(value)) {
        return `${definition.label} must be a valid email address.`;
      }

      if (definition.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(value)) {
        return `${definition.label} must be a valid 6-digit hex color.`;
      }
    }

    if (contrastRatio(draft.primary_theme_color || DEFAULT_SYSTEM_SETTINGS.primary_theme_color, '#ffffff') < 4.5) {
      return 'Primary Theme Color must keep readable white text contrast. Choose a darker color.';
    }

    return '';
  };

  const uploadPendingImages = async (nextDraft: SystemSettingsMap) => {
    const mutableDraft = { ...nextDraft };

    for (const definition of imageDefinitions) {
      const file = pendingUploads[definition.key];
      if (!file) continue;

      const form = new FormData();
      form.append('action', 'upload');
      form.append('image_type', definition.imageType);
      form.append('image', file);

      const response = await fetch(`${API_ENDPOINTS.SETTINGS}?action=upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Failed to upload ${definition.label}`);
      }

      mutableDraft[definition.key] = String(data.file_path || '');
    }

    return mutableDraft;
  };

  const handleSave = async () => {
    if (saving) return;

    const validationError = validateDraft();
    if (validationError) {
      setNotice({ type: 'error', message: validationError });
      return;
    }

    setSaving(true);
    setSaveModal({ phase: 'saving', progress: 8 });
    setNotice(null);

    try {
      const draftWithUploads = await uploadPendingImages(draft);
      const payload = editableKeys.reduce<Record<string, string>>((acc, key) => {
        acc[key] = draftWithUploads[key] ?? DEFAULT_SYSTEM_SETTINGS[key] ?? '';
        return acc;
      }, {});

      const response = await fetch(API_ENDPOINTS.SETTINGS, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save system settings');
      }

      const nextSettings = mapFromApiResponse(data);
      setSettings(nextSettings);
      setDraft(nextSettings);
      setPendingUploads({});
      clearUploadPreviews();
      await refresh();
      setNotice({ type: 'success', message: data.message || 'System settings updated successfully.' });
      setSaveModal({ phase: 'success', progress: 100 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to save system settings. Please try again.';

      setNotice({
        type: 'error',
        message: errorMessage,
      });
      setSaveModal((current) => ({
        phase: 'error',
        progress: Math.max(12, current.progress),
        message: errorMessage || 'Unable to save system settings. Please try again.',
      }));
    } finally {
      setSaving(false);
    }
  };

  const closeSaveModal = () => {
    if (saveModal.phase === 'saving') return;
    setSaveModal({ phase: 'idle', progress: 0 });
  };

  const retrySave = () => {
    if (saving) return;
    void handleSave();
  };

  function clearUploadPreviews() {
    setUploadPreviews((current) => {
      Object.values(current).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
  }

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
          <p className="mt-1 text-sm text-gray-500">
            Customize GradTrack system information, branding, appearance, and system behavior.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => void fetchSettings()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
          <button
            type="button"
            onClick={cancelChanges}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            aria-busy={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1b2a4a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#263c66] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
            notice.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : notice.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {notice.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {notice.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {tabConfig.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                disabled={saving}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-gray-50 px-5 py-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ActiveTabIcon className="h-5 w-5 text-[#1b2a4a]" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1b2a4a]">{activeDetails.label}</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">{activeDetails.description}</p>
          </div>
          <button
            type="button"
            onClick={resetCurrentTab}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </button>
        </div>

        <div className={`grid gap-0 ${activeTab === 'login' ? 'xl:grid-cols-[minmax(0,1fr)_420px]' : ''}`}>
          <div className="divide-y">
            {activeDefinitions.map((definition) => (
              <SettingRow
                key={`${activeTab}-${definition.key}`}
                definition={definition}
                value={draft[definition.key] ?? ''}
                previewUrl={uploadPreviews[definition.key]}
                onChange={(value) => updateDraft(definition.key, value)}
                onToggle={(checked) => handleToggle(definition, checked)}
                onFileChange={(event) => handleFileChange(definition, event)}
                onRemoveImage={() => removeImage(definition)}
                onReset={() => resetSetting(definition.key)}
                disabled={saving}
              />
            ))}
          </div>

          {activeTab === 'login' && (
            <LoginPreview draft={draft} uploadPreviews={uploadPreviews} />
          )}
        </div>
      </section>

      {activeTab === 'branding' && primaryContrast < 4.5 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Primary color contrast with white text is below WCAG AA. Choose a darker primary color before saving.
        </div>
      )}

      {activeTab === 'features' && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Disabled modules remain stored in the database. Users will see an unavailable message instead of deleted data.
        </div>
      )}

      {activeTab === 'maintenance' && isTruthySetting(draft.maintenance_mode, false) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Maintenance Mode is staged as ON. Save changes to apply it to regular users. Super Admin access remains available.
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((current) => ({ ...current, isOpen: false }))}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
        cancelText={msgBox.cancelText}
      />

      <SaveProgressModal state={saveModal} onClose={closeSaveModal} onRetry={retrySave} />
    </div>
  );
}

function SaveProgressModal({
  state,
  onClose,
  onRetry,
}: {
  state: SaveModalState;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [renderedState, setRenderedState] = useState<SaveModalState>(state);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (state.phase === 'idle') {
      if (renderedState.phase === 'idle') return undefined;

      setIsClosing(true);
      const timeout = window.setTimeout(() => {
        setRenderedState(state);
        setIsClosing(false);
      }, 180);

      return () => window.clearTimeout(timeout);
    }

    setRenderedState(state);
    setIsClosing(false);
    return undefined;
  }, [state, renderedState.phase]);

  if (renderedState.phase === 'idle') return null;

  const isSaving = renderedState.phase === 'saving';
  const isSuccess = renderedState.phase === 'success';
  const isError = renderedState.phase === 'error';
  const progress = Math.min(100, Math.max(0, renderedState.progress));

  const title = isSuccess
    ? 'System Settings Saved Successfully'
    : isError
      ? 'Unable to save system settings'
      : 'Saving System Settings';
  const description = isSuccess
    ? 'Your latest configuration has been applied.'
    : isError
      ? (renderedState.message || 'Unable to save system settings. Please try again.')
      : 'Applying your changes, please wait...';

  return (
    <div
      className={`settings-save-modal-overlay fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm ${isClosing ? 'settings-save-modal-overlay--closing' : ''}`}
      aria-live="assertive"
    >
      <div
        role={isError ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="settings-save-title"
        aria-describedby="settings-save-description"
        className={`settings-save-modal-card w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-2xl ${isClosing ? 'settings-save-modal-card--closing' : ''}`}
      >
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            isSuccess
              ? 'bg-green-50 text-green-600'
              : isError
                ? 'bg-red-50 text-red-600'
                : 'bg-blue-50 text-blue-700'
          }`}
        >
          {isSaving && <Loader2 className="h-8 w-8 animate-spin" />}
          {isSuccess && <CheckCircle2 className="settings-save-success-icon h-9 w-9" />}
          {isError && <AlertCircle className="h-8 w-8" />}
        </div>

        <h2 id="settings-save-title" className="mt-5 text-lg font-bold text-[#1b2a4a]">
          {title}
        </h2>
        <p id="settings-save-description" className="mt-2 text-sm leading-6 text-gray-500">
          {description}
        </p>

        <div className="mt-6">
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                isError ? 'bg-red-500' : isSuccess ? 'bg-green-500' : 'settings-save-progress-shimmer bg-blue-700'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs font-semibold text-gray-500">
            <span>{isError ? 'Save interrupted' : isSuccess ? 'Complete' : 'Saving changes'}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {isError && (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center rounded-lg bg-[#1b2a4a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263c66]"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingRow({
  definition,
  value,
  previewUrl,
  onChange,
  onToggle,
  onFileChange,
  onRemoveImage,
  onReset,
  disabled,
}: {
  definition: SettingDefinition;
  value: string;
  previewUrl?: string;
  onChange: (value: string) => void;
  onToggle: (checked: boolean) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onReset: () => void;
  disabled: boolean;
}) {
  return (
    <div className={`grid gap-3 px-5 py-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(320px,1.4fr)] lg:items-center ${disabled ? 'opacity-75' : ''}`}>
      <div>
        <label htmlFor={definition.key} className="text-sm font-semibold text-gray-800">
          {definition.label}
        </label>
        <p className="mt-1 text-sm leading-5 text-gray-500">{definition.description}</p>
      </div>

      <div>
        {definition.type === 'boolean' ? (
          <ToggleControl id={definition.key} checked={isTruthySetting(value, true)} onChange={onToggle} disabled={disabled} />
        ) : definition.type === 'textarea' ? (
          <textarea
            id={definition.key}
            value={value}
            rows={definition.rows || 3}
            onChange={(event) => onChange(event.target.value)}
            placeholder={definition.placeholder}
            disabled={disabled}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : definition.type === 'color' ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              id={definition.key}
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1d4ed8'}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled}
              className="h-11 w-16 cursor-pointer rounded border bg-white p-1 disabled:cursor-not-allowed"
            />
            <input
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled}
              className="w-32 rounded-lg border px-3 py-2.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="button" onClick={onReset} disabled={disabled} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
              Reset
            </button>
          </div>
        ) : definition.type === 'image' ? (
          <ImageSetting
            definition={definition}
            value={value}
            previewUrl={previewUrl}
            onFileChange={onFileChange}
            onRemoveImage={onRemoveImage}
            onReset={onReset}
            disabled={disabled}
          />
        ) : (
          <input
            id={definition.key}
            type={definition.type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={definition.placeholder}
            disabled={disabled}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>
    </div>
  );
}

function ToggleControl({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 peer-disabled:bg-gray-100 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white peer-disabled:after:bg-gray-200" />
      <span className="ml-3 inline-flex min-w-20 items-center gap-1 text-sm font-medium text-gray-700">
        <ToggleLeft className="h-4 w-4" />
        {checked ? 'ON' : 'OFF'}
      </span>
    </label>
  );
}

function ImageSetting({
  definition,
  value,
  previewUrl,
  onFileChange,
  onRemoveImage,
  onReset,
  disabled,
}: {
  definition: SettingDefinition;
  value: string;
  previewUrl?: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onReset: () => void;
  disabled: boolean;
}) {
  const currentUrl = resolveSystemAssetUrl(value || DEFAULT_SYSTEM_SETTINGS[definition.key]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(150px,220px)_minmax(0,1fr)] sm:items-center">
        <div className="flex gap-3">
          <ImagePreview label="Current" src={currentUrl} alt={definition.label} />
          {previewUrl && <ImagePreview label="New" src={previewUrl} alt={`New ${definition.label}`} />}
        </div>

        <div className="flex flex-wrap gap-2">
          <label className={`inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <Upload className="h-4 w-4" />
            Upload
            <input type="file" accept={definition.accept || 'image/*'} className="sr-only" onChange={onFileChange} disabled={disabled} />
          </label>
          <button type="button" onClick={onRemoveImage} disabled={disabled} className="rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
            Remove Image
          </button>
          <button type="button" onClick={onReset} disabled={disabled} className="rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
            Reset
          </button>
        </div>
      </div>

      {previewUrl && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
          New image preview ready. Save changes to upload and apply it.
        </div>
      )}
    </div>
  );
}

function ImagePreview({ label, src, alt }: { label: string; src: string; alt: string }) {
  return (
    <div>
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-gray-50">
        {src ? (
          <img src={src} alt={alt} className="h-full w-full object-contain p-2" />
        ) : (
          <ImagePlus className="h-8 w-8 text-gray-300" />
        )}
      </div>
      <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}

function LoginPreview({ draft, uploadPreviews }: { draft: SystemSettingsMap; uploadPreviews: Record<string, string> }) {
  const logo = uploadPreviews.login_logo_path || resolveSystemAssetUrl(draft.login_logo_path || DEFAULT_SYSTEM_SETTINGS.login_logo_path);
  const background = uploadPreviews.login_background_image_path || resolveSystemAssetUrl(draft.login_background_image_path || DEFAULT_SYSTEM_SETTINGS.login_background_image_path);
  const primary = draft.primary_theme_color || DEFAULT_SYSTEM_SETTINGS.primary_theme_color;

  return (
    <aside className="border-t bg-gray-50 p-5 xl:border-l xl:border-t-0">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1b2a4a]">
        <Monitor className="h-4 w-4" />
        Live Preview
      </div>
      <div
        className="relative min-h-[520px] overflow-hidden rounded-xl border bg-cover bg-center shadow-sm"
        style={{ backgroundImage: background ? `url(${background})` : undefined }}
      >
        <div className="absolute inset-0 bg-blue-900/75" />
        <div className="relative flex min-h-[520px] items-center justify-center p-5">
          <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-xl">
            <div className="mb-5 flex justify-center">
              {logo ? (
                <img src={logo} alt="Login logo preview" className="h-16 object-contain" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100">
                  <Lock className="h-7 w-7 text-gray-400" />
                </div>
              )}
            </div>
            <h3 className="text-center text-2xl font-bold text-blue-900">{draft.login_page_title || 'Sign In'}</h3>
            <p className="mt-2 text-center text-sm text-gray-500">{draft.login_welcome_message || 'Welcome back.'}</p>
            <p className="mt-3 text-center text-sm leading-6 text-gray-600">
              {draft.login_subtitle || DEFAULT_SYSTEM_SETTINGS.login_subtitle}
            </p>
            {draft.additional_login_text && (
              <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-center text-xs text-blue-700">
                {draft.additional_login_text}
              </p>
            )}
            <div className="mt-5 space-y-3">
              <div className="h-11 rounded-lg border bg-gray-50" />
              <div className="h-11 rounded-lg border bg-gray-50" />
              <div className="h-11 rounded-lg" style={{ backgroundColor: primary }} />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
