import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Building2, Loader2, UserRound, X } from 'lucide-react';
import ProfileAvatar from '../ProfileAvatar';
import { formatPresenceLabel } from '../../utils/presence';

export interface GraduateMiniProfileData {
  graduate_id: number;
  full_name: string;
  program_code?: string | null;
  program_name?: string | null;
  program_course?: string | null;
  year_graduated?: number | null;
  profile_image_path?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  last_active_at?: string | null;
}

interface GraduateMiniProfileProps {
  graduateId: number | null;
  presence?: { is_online?: boolean; last_active_at?: string | null } | null;
  loadProfile: (graduateId: number) => Promise<GraduateMiniProfileData>;
  resolveAssetUrl: (path?: string | null) => string;
  onClose: () => void;
  onViewProfile: (graduateId: number) => void;
}

const profileCache = new Map<number, { expiresAt: number; profile: GraduateMiniProfileData }>();
const cacheDurationMs = 5 * 60 * 1000;

export default function GraduateMiniProfile({
  graduateId,
  presence,
  loadProfile,
  resolveAssetUrl,
  onClose,
  onViewProfile,
}: GraduateMiniProfileProps) {
  const [profile, setProfile] = useState<GraduateMiniProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!graduateId) {
      setProfile(null);
      setError('');
      return undefined;
    }

    const cached = profileCache.get(graduateId);
    if (cached && cached.expiresAt > Date.now()) {
      setProfile(cached.profile);
      setLoading(false);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setProfile(null);
    void loadProfile(graduateId)
      .then((result) => {
        if (cancelled) return;
        profileCache.set(graduateId, { expiresAt: Date.now() + cacheDurationMs, profile: result });
        setProfile(result);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load this graduate profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [graduateId, loadProfile]);

  useEffect(() => {
    if (!graduateId) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [graduateId, onClose]);

  if (!graduateId) return null;

  const livePresence = {
    is_online: Boolean(presence?.is_online),
    last_active_at: presence?.last_active_at ?? profile?.last_active_at ?? null,
  };
  const program = profile?.program_course || profile?.program_code || profile?.program_name || 'Graduate';
  const education = profile?.year_graduated ? `${program} • Batch ${profile.year_graduated}` : program;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-label="Graduate mini profile">
        <div className="h-20 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-500" />
        <button type="button" onClick={onClose} className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow transition hover:bg-white" aria-label="Close mini profile">
          <X className="h-4 w-4" />
        </button>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-700" /></div>
        ) : error || !profile ? (
          <div className="px-6 py-10 text-center">
            <UserRound className="mx-auto h-9 w-9 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{error || 'Graduate profile unavailable'}</p>
          </div>
        ) : (
          <div className="px-6 pb-6">
            <div className="relative -mt-10 w-fit">
              <ProfileAvatar
                src={profile.profile_image_path}
                label={profile.full_name}
                resolveUrl={resolveAssetUrl}
                imageClassName="h-20 w-20 rounded-full border-4 border-white object-cover shadow-md dark:border-slate-900"
                fallbackClassName="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-xl font-bold text-blue-800 shadow-md dark:border-slate-900 dark:bg-blue-950 dark:text-blue-200"
              />
              {livePresence.is_online && <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-500 dark:border-slate-900" aria-label="Online" />}
            </div>

            <h2 className="mt-3 text-xl font-bold text-slate-950 dark:text-white">{profile.full_name}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{education}</p>
            <p className={`mt-3 text-sm font-semibold ${livePresence.is_online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {livePresence.is_online && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />}
              {formatPresenceLabel(livePresence)}
            </p>

            {(profile.job_title || profile.company_name) && (
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                {profile.job_title && <p className="flex items-center gap-3 text-slate-700 dark:text-slate-200"><Briefcase className="h-4 w-4 shrink-0 text-blue-600" /> {profile.job_title}</p>}
                {profile.company_name && <p className="flex items-center gap-3 text-slate-700 dark:text-slate-200"><Building2 className="h-4 w-4 shrink-0 text-blue-600" /> {profile.company_name}</p>}
              </div>
            )}

            <button type="button" onClick={() => onViewProfile(profile.graduate_id)} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800">
              View Profile
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
