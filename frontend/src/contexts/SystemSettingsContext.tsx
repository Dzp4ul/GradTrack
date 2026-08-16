import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

export type SystemSettingsMap = Record<string, string>;

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsMap = {
  system_name: 'GradTrack',
  system_short_name: 'GradTrack',
  institution_name: 'Norzagaray College',
  system_description: 'A Web-Based Graduate Tracer System with Alumni Job Support System',
  contact_email: 'norzagaraycollege2007@gmail.com',
  contact_number: '',
  institution_address: 'Norzagaray, Bulacan',
  footer_text: 'Empowering graduates, strengthening connections.',
  copyright_text: '2026 Norzagaray College. All rights reserved.',
  system_logo_path: '/Gradtrack_small.png',
  login_logo_path: '/GRADTRACK_LOGO1.png',
  favicon_path: '/Gradtrack_small.png',
  primary_theme_color: '#1d4ed8',
  secondary_theme_color: '#f8c331',
  login_page_title: 'Sign In',
  login_welcome_message: 'Welcome back.',
  login_subtitle: 'Access GradTrack with your authorized account.',
  login_background_image_path: '/520382375_1065446909052636_3412465913398569974_n.jpg',
  additional_login_text: '',
  feature_graduate_survey_enabled: 'true',
  feature_alumni_job_support_enabled: 'true',
  feature_community_forum_enabled: 'true',
  feature_notifications_enabled: 'true',
  feature_messaging_enabled: 'true',
  survey_title: 'Graduate Tracer Survey',
  survey_instructions: 'Please verify your identity to access the active graduate tracer survey.',
  survey_enabled: 'true',
  survey_available: 'true',
  survey_availability_message: 'The Graduate Tracer Survey is currently unavailable. Please check back later.',
  survey_completion_message: 'Your survey has been submitted successfully.',
  community_forum_enabled: 'true',
  community_available: 'true',
  community_guidelines: 'Keep discussions respectful, relevant, and helpful for fellow Norzagaray College alumni.',
  community_default_announcement: 'Welcome to the GradTrack Community Forum.',
  community_allow_media_uploads: 'true',
  maintenance_mode: 'false',
  maintenance_page_title: 'GradTrack is under maintenance',
  maintenance_message: 'We are performing scheduled maintenance to improve the system. Please check back soon.',
  maintenance_expected_availability_message: '',
};

interface SystemSettingsContextValue {
  settings: SystemSettingsMap;
  isLoading: boolean;
  error: string;
  primaryColor: string;
  accentColor: string;
  isMaintenanceMode: boolean;
  getSetting: (key: string, fallback?: string) => string;
  isEnabled: (key: string, fallback?: boolean) => boolean;
  resolveAssetUrl: (path?: string | null, fallback?: string) => string;
  refresh: () => Promise<void>;
}

const SystemSettingsContext = createContext<SystemSettingsContextValue | undefined>(undefined);

let cachedPublicSettings: SystemSettingsMap | null = null;
let pendingPublicSettingsRequest: Promise<SystemSettingsMap> | null = null;

export function resolveSystemAssetUrl(path?: string | null, fallback = '') {
  const value = (path || fallback || '').trim();
  if (!value) return '';
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  if (value.startsWith('/')) return value;
  return `${API_BASE_URL}/${value.replace(/^\/+/, '')}`;
}

export function isTruthySetting(value?: string | null, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function mergeSettings(settings: SystemSettingsMap): SystemSettingsMap {
  const merged = { ...DEFAULT_SYSTEM_SETTINGS, ...settings };
  merged.survey_available = (
    isTruthySetting(merged.feature_graduate_survey_enabled, true)
    && isTruthySetting(merged.survey_enabled, true)
  ) ? 'true' : 'false';
  merged.community_available = (
    isTruthySetting(merged.feature_community_forum_enabled, true)
    && isTruthySetting(merged.community_forum_enabled, true)
  ) ? 'true' : 'false';
  return merged;
}

async function fetchPublicSettings() {
  if (cachedPublicSettings) return cachedPublicSettings;
  if (pendingPublicSettingsRequest) return pendingPublicSettingsRequest;

  pendingPublicSettingsRequest = fetch(API_ENDPOINTS.SETTINGS_PUBLIC, {
    credentials: 'include',
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load system settings');
      }

      cachedPublicSettings = mergeSettings(data.settings || {});
      return cachedPublicSettings;
    })
    .catch(() => {
      cachedPublicSettings = mergeSettings({});
      return cachedPublicSettings;
    })
    .finally(() => {
      pendingPublicSettingsRequest = null;
    });

  return pendingPublicSettingsRequest;
}

function applyBranding(settings: SystemSettingsMap) {
  const primaryColor = settings.primary_theme_color || DEFAULT_SYSTEM_SETTINGS.primary_theme_color;
  const accentColor = settings.secondary_theme_color || DEFAULT_SYSTEM_SETTINGS.secondary_theme_color;

  document.documentElement.style.setProperty('--gradtrack-primary', primaryColor);
  document.documentElement.style.setProperty('--gradtrack-primary-hover', darkenHex(primaryColor, 12));
  document.documentElement.style.setProperty('--gradtrack-accent', accentColor);
  document.documentElement.style.setProperty('--gradtrack-accent-hover', darkenHex(accentColor, 10));
  document.title = `${settings.system_short_name || settings.system_name || 'GradTrack'} | ${settings.institution_name || 'Norzagaray College'}`;

  const favicon = resolveSystemAssetUrl(settings.favicon_path, DEFAULT_SYSTEM_SETTINGS.favicon_path);
  if (favicon) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = favicon;
  }
}

function darkenHex(hex: string, amount: number) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : DEFAULT_SYSTEM_SETTINGS.primary_theme_color;
  const numeric = normalized.slice(1);
  const channels = [0, 2, 4].map((index) => Math.max(0, parseInt(numeric.slice(index, index + 2), 16) - amount));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function SystemSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettingsMap>(() => cachedPublicSettings || mergeSettings({}));
  const [isLoading, setIsLoading] = useState(!cachedPublicSettings);
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    if (force) {
      cachedPublicSettings = null;
      pendingPublicSettingsRequest = null;
    }

    setIsLoading(!cachedPublicSettings);
    setError('');

    try {
      const nextSettings = await fetchPublicSettings();
      setSettings(nextSettings);
      applyBranding(nextSettings);
    } catch (loadError) {
      const fallbackSettings = mergeSettings({});
      setSettings(fallbackSettings);
      applyBranding(fallbackSettings);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load system settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchPublicSettings()
      .then((nextSettings) => {
        if (!active) return;
        setSettings(nextSettings);
        applyBranding(nextSettings);
      })
      .catch((loadError) => {
        if (!active) return;
        const fallbackSettings = mergeSettings({});
        setSettings(fallbackSettings);
        applyBranding(fallbackSettings);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load system settings');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<SystemSettingsContextValue>(() => {
    const getSetting = (key: string, fallback = '') => settings[key] ?? DEFAULT_SYSTEM_SETTINGS[key] ?? fallback;
    const isEnabled = (key: string, fallback = true) => isTruthySetting(getSetting(key), fallback);
    const resolveAssetUrl = (path?: string | null, fallback = '') => resolveSystemAssetUrl(path, fallback);

    return {
      settings,
      isLoading,
      error,
      primaryColor: getSetting('primary_theme_color', DEFAULT_SYSTEM_SETTINGS.primary_theme_color),
      accentColor: getSetting('secondary_theme_color', DEFAULT_SYSTEM_SETTINGS.secondary_theme_color),
      isMaintenanceMode: isEnabled('maintenance_mode', false),
      getSetting,
      isEnabled,
      resolveAssetUrl,
      refresh: () => load(true),
    };
  }, [error, isLoading, load, settings]);

  return (
    <SystemSettingsContext.Provider value={value}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettings() {
  const context = useContext(SystemSettingsContext);
  if (!context) {
    throw new Error('useSystemSettings must be used within a SystemSettingsProvider');
  }
  return context;
}
