import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Minus, Plus, RefreshCw } from 'lucide-react';
import Footer from '../components/Footer';
import PublicNav from '../components/PublicNav';
import { FaqCategory, fetchPublicContent } from '../services/publicContent';

type FaqResponse = { success: boolean; categories: FaqCategory[] };

function AccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-gray-50 dark:hover:bg-slate-700 sm:px-6 sm:py-5"><span className="text-base font-semibold text-blue-900 dark:text-blue-200 sm:text-lg">{question}</span><span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700">{open ? <Minus className="h-4 w-4 text-blue-900 dark:text-blue-200" /> : <Plus className="h-4 w-4 text-blue-900 dark:text-blue-200" />}</span></button>{open && <div className="px-4 pb-5 sm:px-6 sm:pb-6 sm:pl-16">{answer.split(/\n\s*\n/).map((paragraph, index) => <p key={index} className="mb-3 leading-relaxed text-gray-600 last:mb-0 dark:text-gray-300">{paragraph}</p>)}</div>}</div>;
}

export default function FAQPage() {
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setCategories((await fetchPublicContent<FaqResponse>('faq')).categories); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load frequently asked questions.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="min-h-screen overflow-x-hidden bg-white dark:bg-slate-950"><PublicNav active="faq" /><section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 py-12 sm:py-16"><div className="mx-auto max-w-4xl px-4 text-center sm:px-6"><h1 className="mb-4 text-3xl font-extrabold text-white sm:text-5xl">Frequently Asked Questions</h1><p className="text-base text-blue-200 sm:text-xl">Everything you need to know about GradTrack.</p></div></section><section className="min-h-[360px] bg-gray-50 py-12 dark:bg-slate-900 sm:py-16"><div className="mx-auto max-w-4xl space-y-10 px-4 sm:space-y-14 sm:px-6">{loading ? Array.from({ length: 2 }).map((_, index) => <div key={index} className="animate-pulse space-y-4"><div className="h-8 w-40 rounded bg-gray-200 dark:bg-slate-700" /><div className="h-20 rounded-xl bg-gray-200 dark:bg-slate-700" /><div className="h-20 rounded-xl bg-gray-200 dark:bg-slate-700" /></div>) : error ? <div className="flex flex-col items-center py-16 text-center"><AlertCircle className="mb-3 h-10 w-10 text-red-500" /><p className="text-gray-700 dark:text-gray-200">{error}</p><button onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-white"><RefreshCw className="h-4 w-4" />Try again</button></div> : categories.length === 0 ? <p className="py-16 text-center text-gray-500 dark:text-gray-300">No frequently asked questions are available yet.</p> : categories.map((category) => <div key={category.id}><h2 className="mb-6 text-2xl font-bold text-blue-900 dark:text-blue-200 sm:text-3xl">{category.name}</h2><div className="space-y-3">{category.items.map((item) => <AccordionItem key={item.id} question={item.question} answer={item.answer} />)}</div></div>)}</div></section><section className="bg-yellow-500 py-12 sm:py-14"><div className="mx-auto max-w-3xl px-4 text-center sm:px-6"><h2 className="mb-3 text-2xl font-bold text-blue-900">Still have questions?</h2><p className="mb-6 text-blue-800">Reach out to Norzagaray College at <span className="font-semibold">norzagaraycollege2007@gmail.com</span></p><Link to="/survey" className="inline-block w-full rounded-lg bg-blue-900 px-10 py-4 text-base font-bold text-white shadow-lg transition hover:bg-blue-800 sm:w-auto sm:text-lg">Take the Survey</Link></div></section><Footer /></div>;
}
