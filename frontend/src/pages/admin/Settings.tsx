import { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;

interface Setting {
  id: number;
  setting_key: string;
  setting_value: string;
  setting_group: string;
}

const groupLabels: Record<string, string> = {
  general: 'General Settings',
  institution: 'Institution Information',
  academic: 'Academic Settings',
  notifications: 'Notification Settings',
  system: 'System Settings',
};

const fieldLabels: Record<string, string> = {
  site_name: 'Site Name',
  site_description: 'Site Description',
  contact_email: 'Contact Email',
  contact_phone: 'Contact Phone',
  institution_name: 'Institution Name',
  institution_address: 'Institution Address',
  academic_year: 'Academic Year',
  survey_reminder_days: 'Survey Reminder (days)',
  enable_email_notifications: 'Enable Email Notifications',
  maintenance_mode: 'Maintenance Mode',
};

export default function Settings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Setting[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = () => {
    setLoading(true);
    fetch(`${API_BASE}/settings/index.php`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setSettings(res.data);
          setGrouped(res.grouped);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSettings(); }, []);

  const updateValue = (key: string, value: string) => {
    setSettings((prev) =>
      prev.map((s) => (s.setting_key === key ? { ...s, setting_value: value } : s))
    );
    setGrouped((prev) => {
      const newGrouped = { ...prev };
      for (const group in newGrouped) {
        newGrouped[group] = newGrouped[group].map((s) =>
          s.setting_key === key ? { ...s, setting_value: value } : s
        );
      }
      return newGrouped;
    });
    setSaved(false);
  };

  const handleSave = () => {
    setSaving(true);
    fetch(`${API_BASE}/settings/index.php`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        settings: settings.map((s) => ({
          setting_key: s.setting_key,
          setting_value: s.setting_value,
          setting_group: s.setting_group,
        })),
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSaved(true);
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1b2a4a]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">System Settings</h1>
          <p className="text-sm text-gray-500">Manage application configuration</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSettings}
            className="flex items-center gap-2 border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Reload
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#1b2a4a] text-white px-5 py-2.5 rounded-lg hover:bg-[#263c66] transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">
          Settings saved successfully!
        </div>
      )}

      <div className="space-y-6">
        {Object.keys(grouped).map((group) => (
          <div key={group} className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b">
              <h2 className="text-sm font-semibold text-[#1b2a4a] uppercase tracking-wide">
                {groupLabels[group] || group}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              {grouped[group].map((setting) => (
                <div key={setting.setting_key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <label className="text-sm font-medium text-gray-700">
                    {fieldLabels[setting.setting_key] || setting.setting_key}
                  </label>
                  <div className="md:col-span-2">
                    {setting.setting_value === 'true' || setting.setting_value === 'false' ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={setting.setting_value === 'true'}
                          onChange={(e) => updateValue(setting.setting_key, e.target.checked ? 'true' : 'false')}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                        <span className="ml-3 text-sm text-gray-600">
                          {setting.setting_value === 'true' ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    ) : (
                      <input
                        type="text"
                        value={setting.setting_value || ''}
                        onChange={(e) => updateValue(setting.setting_key, e.target.value)}
                        className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
