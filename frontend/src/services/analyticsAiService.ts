import { API_ROOT } from '../config/api';

export interface StatisticalInterpretationDetails {
  analysis_performed: string;
  variables_compared: string;
  hypothesis_explanation: string;
  statistical_result: string;
  significance_interpretation: string;
  effect_size_interpretation: string;
  data_quality_interpretation: string;
  practical_meaning: string;
}

export interface StatisticalInterpretation {
  headline: string;
  summary: string;
  statistical_interpretation: string;
  practical_interpretation: string;
  caution: string;
  thesis_interpretation: string;
  details: StatisticalInterpretationDetails;
}

export interface StatisticalInterpretationContext {
  fingerprint: string;
  canGenerate: boolean;
  hasWarnings: boolean;
  fallback: StatisticalInterpretation;
}

export interface StatisticalInterpretationResponse {
  analysisFingerprint: string;
  interpretation: StatisticalInterpretation;
  source: 'ai' | 'fallback';
  model: string | null;
  cached: boolean;
  regenerationLimited: boolean;
  notice: string | null;
}

interface CachedInterpretation {
  response: StatisticalInterpretationResponse;
  expiresAt: number;
}

const responseCache = new Map<string, CachedInterpretation>();
const pendingRequests = new Map<string, Promise<StatisticalInterpretationResponse>>();
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 60 * 1000;

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isStatisticalInterpretation = (value: unknown): value is StatisticalInterpretation => {
  if (!value || typeof value !== 'object') return false;
  const interpretation = value as Partial<StatisticalInterpretation>;
  const fields: Array<keyof Omit<StatisticalInterpretation, 'details'>> = [
    'headline',
    'summary',
    'statistical_interpretation',
    'practical_interpretation',
    'caution',
    'thesis_interpretation',
  ];
  if (!fields.every((field) => isNonEmptyString(interpretation[field]))) return false;

  const details = interpretation.details;
  if (!details || typeof details !== 'object') return false;
  const detailFields: Array<keyof StatisticalInterpretationDetails> = [
    'analysis_performed',
    'variables_compared',
    'hypothesis_explanation',
    'statistical_result',
    'significance_interpretation',
    'effect_size_interpretation',
    'data_quality_interpretation',
    'practical_meaning',
  ];
  return detailFields.every((field) => isNonEmptyString(details[field]));
};

const requestInterpretation = async (
  context: StatisticalInterpretationContext,
  regenerate: boolean,
): Promise<StatisticalInterpretationResponse> => {
  const response = await fetch(`${API_ROOT}/reports/ai-statistical-interpretation.php`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      analysisFingerprint: context.fingerprint,
      regenerate,
    }),
  });
  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    error?: string;
    data?: Partial<StatisticalInterpretationResponse>;
  } | null;

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || 'AI interpretation is temporarily unavailable.');
  }
  const data = payload.data;
  if (
    data.analysisFingerprint !== context.fingerprint
    || (data.source !== 'ai' && data.source !== 'fallback')
    || !isStatisticalInterpretation(data.interpretation)
  ) {
    throw new Error('The interpretation response could not be verified.');
  }

  return {
    analysisFingerprint: data.analysisFingerprint,
    interpretation: data.interpretation,
    source: data.source,
    model: typeof data.model === 'string' ? data.model : null,
    cached: data.cached === true,
    regenerationLimited: data.regenerationLimited === true,
    notice: typeof data.notice === 'string' ? data.notice : null,
  };
};

export const getStatisticalInterpretation = (
  context: StatisticalInterpretationContext,
  options: { regenerate?: boolean } = {},
): Promise<StatisticalInterpretationResponse> => {
  const regenerate = options.regenerate === true;
  if (!context.canGenerate) {
    return Promise.resolve({
      analysisFingerprint: context.fingerprint,
      interpretation: context.fallback,
      source: 'fallback',
      model: null,
      cached: true,
      regenerationLimited: false,
      notice: null,
    });
  }

  if (!regenerate) {
    const cached = responseCache.get(context.fingerprint);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve({ ...cached.response, cached: true });
    }
    if (cached) responseCache.delete(context.fingerprint);
    const pending = pendingRequests.get(context.fingerprint);
    if (pending) return pending;
  } else {
    responseCache.delete(context.fingerprint);
  }

  const request = requestInterpretation(context, regenerate)
    .then((result) => {
      responseCache.set(context.fingerprint, {
        response: result,
        expiresAt: Date.now() + (result.source === 'ai' ? AI_CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS),
      });
      return result;
    })
    .finally(() => {
      if (pendingRequests.get(context.fingerprint) === request) {
        pendingRequests.delete(context.fingerprint);
      }
    });

  pendingRequests.set(context.fingerprint, request);
  return request;
};

export const clearStatisticalInterpretationCache = (fingerprint: string): void => {
  responseCache.delete(fingerprint);
};
