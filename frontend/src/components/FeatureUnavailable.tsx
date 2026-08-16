import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useSystemSettings } from '../contexts/SystemSettingsContext';

interface FeatureUnavailableProps {
  title?: string;
  message?: string;
  backTo?: string;
  backLabel?: string;
  compact?: boolean;
}

export default function FeatureUnavailable({
  title = 'This feature is currently unavailable.',
  message = 'Please check back later or contact the administrator for assistance.',
  backTo = '/',
  backLabel = 'Back to Home',
  compact = false,
}: FeatureUnavailableProps) {
  const { getSetting, resolveAssetUrl } = useSystemSettings();
  const background = resolveAssetUrl(getSetting('login_background_image_path'), '/520382375_1065446909052636_3412465913398569974_n.jpg');
  const logo = resolveAssetUrl(getSetting('system_logo_path'), '/Gradtrack_small.png');

  if (compact) {
    return (
      <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{message}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-fixed p-4 sm:p-6" style={{ backgroundImage: `url(${background})` }}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80" />
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-blue-100 bg-white p-6 text-center shadow-xl sm:p-10">
        {logo && <img src={logo} alt={getSetting('system_short_name', 'GradTrack')} className="mx-auto mb-5 h-16 w-16 object-contain" />}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-blue-900 sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">{message}</p>
        <Link to={backTo} className="mt-7 inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700">
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
