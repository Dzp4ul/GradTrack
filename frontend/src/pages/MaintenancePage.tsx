import { Link } from 'react-router-dom';
import { Settings, ShieldCheck } from 'lucide-react';
import { useSystemSettings } from '../contexts/SystemSettingsContext';

export default function MaintenancePage() {
  const { getSetting, resolveAssetUrl } = useSystemSettings();
  const logo = resolveAssetUrl(getSetting('system_logo_path'), '/Gradtrack_small.png');
  const title = getSetting('maintenance_page_title', 'GradTrack is under maintenance');
  const message = getSetting('maintenance_message', 'We are performing scheduled maintenance to improve the system. Please check back soon.');
  const availability = getSetting('maintenance_expected_availability_message');
  const institution = getSetting('institution_name', 'Norzagaray College');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
          {logo ? (
            <img src={logo} alt={institution} className="h-12 w-12 object-contain" />
          ) : (
            <Settings className="h-8 w-8 text-blue-700" />
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            System Maintenance
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-bold text-[#1b2a4a] sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">{message}</p>
        {availability && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {availability}
          </p>
        )}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/admin/signin"
            className="inline-flex items-center justify-center rounded-lg bg-[#1b2a4a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263c66]"
          >
            Super Admin Sign In
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
