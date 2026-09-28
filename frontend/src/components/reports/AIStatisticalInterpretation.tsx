import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import {
  getStatisticalInterpretation,
  type StatisticalInterpretation,
  type StatisticalInterpretationContext,
} from '../../services/analyticsAiService';

interface AIStatisticalInterpretationProps {
  context: StatisticalInterpretationContext;
}

function InterpretationSkeleton() {
  return (
    <div className="space-y-2 px-4 py-5 sm:px-5" role="status" aria-live="polite">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Generating statistical interpretation...</p>
      <div className="animate-pulse space-y-2" aria-hidden="true">
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-4/5 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

export default function AIStatisticalInterpretation({ context }: AIStatisticalInterpretationProps) {
  const [interpretation, setInterpretation] = useState<StatisticalInterpretation>(context.fallback);
  const [source, setSource] = useState<'ai' | 'fallback'>('fallback');
  const [loading, setLoading] = useState(context.canGenerate);
  const [regenerationCoolingDown, setRegenerationCoolingDown] = useState(false);
  const requestSequence = useRef(0);
  const cooldownTimer = useRef<number | null>(null);

  const loadInterpretation = useCallback(async (regenerate: boolean) => {
    const requestId = ++requestSequence.current;
    setLoading(true);

    try {
      const response = await getStatisticalInterpretation(context, { regenerate });
      if (requestId !== requestSequence.current) return;
      setInterpretation(response.interpretation);
      setSource(response.source);
    } catch {
      if (requestId !== requestSequence.current) return;
      setInterpretation(context.fallback);
      setSource('fallback');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    requestSequence.current += 1;
    setInterpretation(context.fallback);
    setSource('fallback');

    if (context.canGenerate) {
      void loadInterpretation(false);
    } else {
      setLoading(false);
    }

    return () => {
      requestSequence.current += 1;
    };
  }, [context, loadInterpretation]);

  useEffect(() => () => {
    if (cooldownTimer.current !== null) window.clearTimeout(cooldownTimer.current);
  }, []);

  const regenerate = () => {
    if (loading || regenerationCoolingDown || !context.canGenerate) return;
    setRegenerationCoolingDown(true);
    if (cooldownTimer.current !== null) window.clearTimeout(cooldownTimer.current);
    cooldownTimer.current = window.setTimeout(() => setRegenerationCoolingDown(false), 10_000);
    void loadInterpretation(true);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-labelledby="statistical-interpretation-title">
      <div className="flex flex-col gap-2 bg-blue-50 px-4 py-3 dark:bg-blue-950/40 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2.5">
          <Info className="h-5 w-5 flex-none text-blue-700 dark:text-blue-300" aria-hidden="true" />
          <h3 id="statistical-interpretation-title" className="text-base font-bold text-blue-900 dark:text-blue-100">Interpretation</h3>
        </div>
        {!loading && (
          <span className="w-fit rounded-full border border-blue-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:border-blue-800 dark:bg-slate-900/70 dark:text-blue-300">
            {source === 'ai' ? 'AI-generated from verified results' : 'Verified standard interpretation'}
          </span>
        )}
      </div>

      {loading ? (
        <InterpretationSkeleton />
      ) : (
        <div className="px-4 py-4 sm:px-5 sm:py-5" aria-live="polite">
          <div>
            <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">
              What This Result Means
            </h4>
            <p className="mt-2 text-[15px] leading-7 text-slate-800 dark:text-slate-200">
              {interpretation.practical_interpretation}
            </p>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Statistical basis
            </h4>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {interpretation.thesis_interpretation}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <button
          type="button"
          onClick={regenerate}
          disabled={loading || regenerationCoolingDown || !context.canGenerate}
          className="inline-flex min-h-10 items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-300"
          title={regenerationCoolingDown ? 'Please wait briefly before regenerating again.' : 'Request a fresh explanation of the same verified result'}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {loading ? 'Generating...' : regenerationCoolingDown ? 'Available shortly' : 'Regenerate interpretation'}
        </button>
      </div>
    </section>
  );
}
