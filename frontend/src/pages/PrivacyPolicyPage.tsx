import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Footer from '../components/Footer';
import PublicNav from '../components/PublicNav';
import { fetchPublicContent, PrivacyMeta, PrivacySection } from '../services/publicContent';

type PrivacyResponse = { success: boolean; meta: PrivacyMeta; sections: PrivacySection[] };
const formatDate = (value: string) => { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date); };

export default function PrivacyPolicyPage() {
  const [data, setData] = useState<PrivacyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await fetchPublicContent<PrivacyResponse>('privacy')); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load the Privacy Policy.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="min-h-screen overflow-x-hidden bg-white dark:bg-slate-950"><PublicNav active="privacy" /><section className="min-h-[65vh] bg-gray-50 py-10 dark:bg-slate-900 sm:py-16"><div className="mx-auto max-w-5xl px-4 sm:px-6">{loading ? <div className="animate-pulse space-y-8"><div className="h-24 rounded bg-gray-200 dark:bg-slate-700" />{Array.from({ length: 5 }).map((_, index) => <div key={index} className="space-y-3"><div className="h-8 w-1/2 rounded bg-gray-200 dark:bg-slate-700" /><div className="h-20 rounded bg-gray-200 dark:bg-slate-700" /></div>)}</div> : error ? <div className="flex flex-col items-center py-24 text-center"><AlertCircle className="mb-3 h-10 w-10 text-red-500" /><p className="text-gray-700 dark:text-gray-200">{error}</p><button onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-white"><RefreshCw className="h-4 w-4" />Try again</button></div> : data && <div className="space-y-8 text-gray-700 dark:text-gray-300 sm:space-y-10"><p className="leading-relaxed">{data.meta.introductory_statement}</p><p className="leading-relaxed">This policy is effective as of {formatDate(data.meta.effective_date)}, and was last updated on {formatDate(data.meta.last_updated_date)}.</p>{data.sections.map((section) => <div key={section.id}><h2 className="mb-3 text-2xl font-bold text-blue-900 dark:text-blue-200 sm:text-3xl">{section.heading}</h2><div className="public-rich-text" dangerouslySetInnerHTML={{ __html: section.content_html }} /></div>)}</div>}</div></section><Footer /></div>;
}
