import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Footer from '../components/Footer';
import PublicNav from '../components/PublicNav';
import { AboutSection, fetchPublicContent, resolvePublicContentAsset } from '../services/publicContent';

type AboutResponse = { success: boolean; sections: AboutSection[] };

function LoadingPage() {
  return <div aria-label="Loading About page content" className="animate-pulse"><div className="h-[330px] bg-blue-900" /><div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2"><div className="h-52 rounded-2xl bg-gray-200 dark:bg-slate-700" /><div className="space-y-4"><div className="h-8 w-2/3 rounded bg-gray-200 dark:bg-slate-700" /><div className="h-28 rounded bg-gray-200 dark:bg-slate-700" /></div></div></div>;
}

export default function AboutPage() {
  const [sections, setSections] = useState<AboutSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setSections((await fetchPublicContent<AboutResponse>('about')).sections); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load the About page.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const byKey = useMemo(() => Object.fromEntries(sections.map((section) => [section.section_key, section])), [sections]);
  const title = (section: AboutSection, mission = false) => mission
    ? <h2 className="mb-4 text-3xl font-extrabold text-yellow-400 sm:mb-6 sm:text-4xl">{section.title}</h2>
    : <h2 className="mb-4 text-2xl font-bold sm:text-3xl"><span className="text-yellow-500">{section.title} </span>{section.subtitle && <span className="text-blue-900 dark:text-blue-200">{section.subtitle}</span>}</h2>;
  const image = (section: AboutSection, className: string, style?: React.CSSProperties) => section.image_path
    ? <img src={resolvePublicContentAsset(section.image_path)} alt={section.image_alt || section.title} className={className} style={style} /> : null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-white dark:bg-slate-950">
      <PublicNav active="about" />
      {loading ? <LoadingPage /> : error ? <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center"><AlertCircle className="mb-3 h-10 w-10 text-red-500" /><p className="text-gray-700 dark:text-gray-200">{error}</p><button onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-white"><RefreshCw className="h-4 w-4" />Try again</button></div> : <>
        {byKey.mission && <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 py-14 sm:py-20"><div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 md:grid-cols-2 md:gap-12"><div className="flex justify-center">{image(byKey.mission, 'h-40 object-contain sm:h-64')}</div><div>{title(byKey.mission, true)}<p className="text-lg leading-relaxed text-white sm:text-2xl">{byKey.mission.content}</p></div></div></section>}
        <div className="h-2 bg-yellow-500" />
        {byKey.challenge && <section className="bg-gray-50 py-14 dark:bg-slate-900 sm:py-24"><div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 md:grid-cols-2 md:gap-16"><div>{title(byKey.challenge)}<p className="text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg">{byKey.challenge.content}</p></div><div className="flex justify-center">{image(byKey.challenge, 'h-48 object-contain sm:h-64')}</div></div></section>}
        {byKey.solution && <section className="bg-white py-14 dark:bg-slate-950 sm:py-24"><div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 md:grid-cols-2 md:gap-16">{image(byKey.solution, 'h-64 w-full object-contain sm:h-96')}<div className="order-1 md:order-2">{title(byKey.solution)}<p className="text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg">{byKey.solution.content}</p></div></div></section>}
        {byKey.impact && <section className="overflow-hidden border-b-4 border-yellow-500 bg-gray-100 dark:bg-slate-900"><div className="mx-auto grid max-w-6xl items-stretch gap-8 px-4 sm:px-6 md:grid-cols-2 md:gap-12"><div className="flex flex-col justify-center py-12 sm:py-16">{title(byKey.impact)}<p className="text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg">{byKey.impact.content}</p></div><div className="flex items-end justify-end">{image(byKey.impact, 'w-auto object-contain object-bottom', { height: '110%', maxHeight: '500px', marginBottom: '-4px' })}</div></div></section>}
        {byKey.cta && <section className="bg-yellow-500 py-12 sm:py-16"><div className="mx-auto max-w-3xl px-4 text-center sm:px-6"><h2 className="mb-4 text-2xl font-bold text-blue-900 sm:text-3xl">{byKey.cta.title}</h2><p className="mb-8 text-base text-blue-800 sm:text-lg">{byKey.cta.content}</p>{byKey.cta.subtitle && <Link to="/survey" className="inline-block w-full rounded-lg bg-blue-900 px-10 py-4 text-base font-bold text-white shadow-lg transition hover:bg-blue-800 sm:w-auto sm:text-lg">{byKey.cta.subtitle}</Link>}</div></section>}
      </>}
      <Footer />
    </div>
  );
}
