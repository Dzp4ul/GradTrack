import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck, ChevronRight, ChevronLeft, ClipboardList, Save, Eye, EyeOff } from 'lucide-react';
import MessageBox from '../components/MessageBox';
import { API_ENDPOINTS, API_ROOT } from '../config/api';
import { philippineProvinces, philippineRegions } from '../data/philippineAddress';

interface Question {
  id?: number;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: number;
  sort_order: number;
  section?: string;
}

interface Survey {
  id: number;
  title: string;
  description: string;
  status: string;
  questions: Question[];
}

interface AccountPrefillData {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  year_graduated: string;
  address: string;
  program_id: number | null;
  program_name: string;
}

interface TokenProfileData {
  student_id?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  name_extension?: string | null;
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
  telephone?: string | null;
  year_graduated?: number | string | null;
  address?: string | null;
  region?: string | null;
  province?: string | null;
  city?: string | null;
  municipality?: string | null;
  civil_status?: string | null;
  sex?: string | null;
  gender?: string | null;
  birthday?: string | null;
  birth_date?: string | null;
  date_of_birth?: string | null;
  program_id?: number | string | null;
  program_name?: string | null;
  program_code?: string | null;
}

type SurveyAnswer = string | number | string[] | null | undefined;
type SurveyResponses = Record<number, SurveyAnswer>;

const getSurveyDraftKey = (surveyId: number, graduateId: number | null) =>
  graduateId && graduateId > 0
    ? `survey_draft_${surveyId}_g${graduateId}`
    : `survey_draft_${surveyId}`;

const sanitizeDraftResponses = (draftResponses: unknown, questions: Question[]): SurveyResponses => {
  if (!draftResponses || typeof draftResponses !== 'object' || Array.isArray(draftResponses)) {
    return {};
  }

  const validQuestionIds = new Set(
    questions
      .map((question) => Number(question.id))
      .filter((questionId) => Number.isFinite(questionId) && questionId > 0)
  );

  const sanitized: SurveyResponses = {};
  Object.entries(draftResponses as Record<string, unknown>).forEach(([key, value]) => {
    const questionId = Number(key);
    if (!Number.isFinite(questionId) || !validQuestionIds.has(questionId)) {
      return;
    }

    sanitized[questionId] = value as SurveyAnswer;
  });

  return sanitized;
};

const normalizeComparable = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const getProfileText = (profile: TokenProfileData, keys: Array<keyof TokenProfileData>) => {
  for (const key of keys) {
    const value = profile[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
};

const hasAnswer = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim() !== '';
};

const isProfessionalExamHeader = (question: Question) =>
  normalizeComparable(question.question_text).startsWith('professional examination s passed');

const isHeaderQuestion = (question: Question) =>
  question.question_type === 'header' || isProfessionalExamHeader(question);

const splitHeaderText = (text: string) => {
  const match = text.match(/^(.*?)(\s*\([^)]*\))$/);
  const isProfessionalHeader = normalizeComparable(text).startsWith('professional examination s passed');

  return {
    title: (match?.[1] || text).trim(),
    suffix: (match?.[2] || (isProfessionalHeader ? '(if applicable)' : '')).trim(),
  };
};

const isChoiceQuestion = (question: Question) =>
  question.question_type === 'multiple_choice' || question.question_type === 'radio';

const isOtherOption = (option: string) => {
  const normalized = normalizeComparable(option);
  return normalized === 'other' || normalized === 'others';
};

const isOtherStoredValue = (value: string, option: string) => {
  const trimmedValue = value.trim();
  const normalizedValue = normalizeComparable(trimmedValue);
  const normalizedOption = normalizeComparable(option);

  return (
    normalizedValue === normalizedOption ||
    trimmedValue.toLowerCase().startsWith(`${option.toLowerCase()}:`) ||
    (isOtherOption(option) && /^(other|others)\s*:/.test(trimmedValue.toLowerCase()))
  );
};

const getOtherOption = (question: Question) =>
  question.options?.find(isOtherOption) || null;

const buildOtherAnswer = (option: string, text: string) => {
  const trimmedText = text.trim();
  return trimmedText ? `${option}: ${trimmedText}` : option;
};

const getOtherTextFromValue = (value: string, option: string) => {
  const trimmedValue = value.trim();
  const lowerValue = trimmedValue.toLowerCase();
  const optionPrefix = `${option.toLowerCase()}:`;

  if (lowerValue.startsWith(optionPrefix)) {
    return trimmedValue.slice(optionPrefix.length).trimStart();
  }

  if (isOtherOption(option)) {
    const fallbackMatch = trimmedValue.match(/^(other|others)\s*:\s*(.*)$/i);
    return fallbackMatch?.[2] || '';
  }

  return '';
};

const getOtherTextFromAnswer = (answer: SurveyAnswer, option: string) => {
  if (Array.isArray(answer)) {
    const otherValue = answer.find((item) => isOtherStoredValue(String(item), option));
    return otherValue ? getOtherTextFromValue(String(otherValue), option) : '';
  }

  if (typeof answer === 'string' && isOtherStoredValue(answer, option)) {
    return getOtherTextFromValue(answer, option);
  }

  return '';
};

const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const NAME_EXTENSION_OPTIONS = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'VI'];

const isNameExtensionQuestion = (question: Question) =>
  normalizeComparable(question.question_text).includes('name extension');

const hasBlankOtherSelection = (question: Question, answer: SurveyAnswer) => {
  const otherOption = getOtherOption(question);
  if (!otherOption) {
    return false;
  }

  if (Array.isArray(answer)) {
    return answer.some((item) => isOtherStoredValue(String(item), otherOption)) && !getOtherTextFromAnswer(answer, otherOption).trim();
  }

  return typeof answer === 'string' && isOtherStoredValue(answer, otherOption) && !getOtherTextFromAnswer(answer, otherOption).trim();
};

const getProvinceRegion = (provinceName: string) => {
  const normalizedProvince = normalizeComparable(provinceName);

  for (const [regionCode, provinces] of Object.entries(philippineProvinces)) {
    const match = provinces.find((province) => normalizeComparable(province) === normalizedProvince);
    if (match) {
      const region = philippineRegions.find((item) => item.code === regionCode);
      return { province: match, region: region?.name || regionCode };
    }
  }

  return { province: provinceName, region: '' };
};

const extractAddressParts = (profile: TokenProfileData) => {
  const address = getProfileText(profile, ['address']);
  const directProvince = getProfileText(profile, ['province']);
  const directCity = getProfileText(profile, ['city', 'municipality']);
  const directRegion = getProfileText(profile, ['region']);
  const addressParts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const normalizedAddress = normalizeComparable(address);

  let province = directProvince;
  let region = directRegion;

  if (!province && normalizedAddress) {
    for (const provinces of Object.values(philippineProvinces)) {
      const match = provinces.find((item) => normalizedAddress.includes(normalizeComparable(item)));
      if (match) {
        province = match;
        break;
      }
    }
  }

  if (!region && province) {
    region = getProvinceRegion(province).region;
  }

  let city = directCity;
  if (!city && addressParts.length > 0) {
    const provinceIndex = province
      ? addressParts.findIndex((part) => normalizeComparable(part).includes(normalizeComparable(province)))
      : -1;

    if (provinceIndex > 0) {
      city = addressParts[provinceIndex - 1];
    } else {
      city = addressParts.find((part) => {
        const normalizedPart = normalizeComparable(part);
        return normalizedPart !== normalizeComparable(province) && !normalizedPart.includes('region');
      }) || '';
    }
  }

  return { region, province, city };
};

const matchQuestionOption = (question: Question, candidates: string[]) => {
  const options = question.options || [];
  if (options.length === 0) {
    return candidates.find(Boolean) || '';
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeComparable(candidate);
    if (!normalizedCandidate) continue;

    const exactMatch = options.find((option) => normalizeComparable(option) === normalizedCandidate);
    if (exactMatch) return exactMatch;

    const closeMatch = options.find((option) => {
      const normalizedOption = normalizeComparable(option);
      return normalizedOption.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedOption);
    });
    if (closeMatch) return closeMatch;
  }

  return '';
};

const formatValueForQuestion = (question: Question, candidates: string[]) => {
  const cleanCandidates = candidates.map((value) => String(value || '').trim()).filter(Boolean);
  if (cleanCandidates.length === 0) return '';

  if (question.question_type === 'date') {
    return cleanCandidates[0].slice(0, 10);
  }

  if (isChoiceQuestion(question)) {
    return matchQuestionOption(question, cleanCandidates);
  }

  return cleanCandidates[0];
};

const getGraduateAutofillValue = (question: Question, profile: TokenProfileData) => {
  const questionText = normalizeComparable(question.question_text);
  const addressParts = extractAddressParts(profile);

  if (questionText.includes('first name') || questionText.includes('given name')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['first_name'])]);
  }

  if (questionText.includes('middle name')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['middle_name'])]);
  }

  if (questionText.includes('last name') || questionText.includes('surname') || questionText.includes('family name')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['last_name'])]);
  }

  if (questionText.includes('name extension') || questionText.includes('suffix')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['name_extension'])]);
  }

  if (questionText.includes('student number') || questionText.includes('student no') || questionText.includes('student id')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['student_id'])]);
  }

  if (questionText.includes('email') || questionText.includes('e mail')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['email'])]);
  }

  if (questionText.includes('mobile') || questionText.includes('cellphone')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['mobile', 'phone', 'telephone'])]);
  }

  if (
    questionText.includes('telephone')
    || questionText.includes('phone')
    || questionText.includes('contact number')
    || questionText.includes('contact no')
    || questionText.includes('contact #')
  ) {
    return formatValueForQuestion(question, [getProfileText(profile, ['telephone', 'phone', 'mobile'])]);
  }

  if (questionText.includes('region')) {
    return formatValueForQuestion(question, [addressParts.region]);
  }

  if (questionText.includes('province')) {
    return formatValueForQuestion(question, [addressParts.province]);
  }

  if (questionText.includes('city') || questionText.includes('municipality')) {
    return formatValueForQuestion(question, [addressParts.city]);
  }

  if (questionText.includes('address')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['address'])]);
  }

  if (questionText.includes('civil status')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['civil_status'])]);
  }

  if (/\bsex\b/.test(questionText) || questionText.includes('gender')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['sex', 'gender'])]);
  }

  if (questionText.includes('birthday') || questionText.includes('birth date') || questionText.includes('date of birth')) {
    return formatValueForQuestion(question, [getProfileText(profile, ['birthday', 'birth_date', 'date_of_birth'])]);
  }

  if (
    questionText.includes('year graduated')
    || questionText.includes('year of graduation')
    || questionText.includes('yr graduated')
    || questionText.includes('graduation year')
  ) {
    return formatValueForQuestion(question, [getProfileText(profile, ['year_graduated'])]);
  }

  if (
    questionText.includes('degree program')
    || questionText.includes('degree program specialization')
    || questionText.includes('degree course')
    || questionText.includes('degree completed')
    || questionText.includes('program completed')
    || questionText.includes('course completed')
    || questionText === 'program'
    || questionText === 'course'
  ) {
    return formatValueForQuestion(question, [
      getProfileText(profile, ['program_name']),
      getProfileText(profile, ['program_code']),
    ]);
  }

  return '';
};

const applyGraduateAutofill = (
  questions: Question[],
  profile: TokenProfileData,
  initialResponses: SurveyResponses,
) => {
  const nextResponses = { ...initialResponses };
  const filledQuestionIds: number[] = [];

  questions.forEach((question) => {
    if (isHeaderQuestion(question) || !question.id || hasAnswer(nextResponses[question.id])) {
      return;
    }

    const value = getGraduateAutofillValue(question, profile);
    if (!hasAnswer(value)) {
      return;
    }

    nextResponses[question.id] = value;
    filledQuestionIds.push(question.id);
  });

  return { responses: nextResponses, filledQuestionIds };
};

function Survey() {
  const [searchParams] = useSearchParams();
  const surveyIdFromUrl = searchParams.get('survey_id');
  const hydratedDraftKeyRef = useRef<string | null>(null);
  
  const [agreed, setAgreed] = useState(false);
  const [agreedCheckbox, setAgreedCheckbox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [responses, setResponses] = useState<SurveyResponses>({});
  const [autoFilledQuestionIds, setAutoFilledQuestionIds] = useState<Set<number>>(new Set());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [msgBox, setMsgBox] = useState<{ isOpen: boolean; type: 'success' | 'error' | 'warning' | 'info'; message: string; title?: string }>({ isOpen: false, type: 'info', message: '' });
  const [token, setToken] = useState<string | null>(null);
  const [graduateId, setGraduateId] = useState<number | null>(null);
  const [graduateName, setGraduateName] = useState<string>('');
  const [postSubmitModalOpen, setPostSubmitModalOpen] = useState(false);
  const [showCreateAccountForm, setShowCreateAccountForm] = useState(false);
  const [submittedResponseId, setSubmittedResponseId] = useState<number | null>(null);
  const [prefillData, setPrefillData] = useState<AccountPrefillData | null>(null);
  const [tokenProfileData, setTokenProfileData] = useState<TokenProfileData | null>(null);
  const [accountPassword, setAccountPassword] = useState('');
  const [accountConfirmPassword, setAccountConfirmPassword] = useState('');
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showAccountConfirmPassword, setShowAccountConfirmPassword] = useState(false);
  const [accountSubmitting, setAccountSubmitting] = useState(false);

  useEffect(() => {
    validateTokenAndFetchSurvey();
  }, []);

  const validateTokenAndFetchSurvey = async () => {
    // Get token from sessionStorage
    const storedToken = sessionStorage.getItem('survey_token');
    const storedGraduateId = sessionStorage.getItem('graduate_id');
    const storedGraduateName = sessionStorage.getItem('graduate_name');
    const storedGraduateProfile = sessionStorage.getItem('graduate_profile');
    let parsedStoredProfile: TokenProfileData | null = null;

    if (storedGraduateProfile) {
      try {
        parsedStoredProfile = JSON.parse(storedGraduateProfile);
      } catch {
        sessionStorage.removeItem('graduate_profile');
      }
    }

    console.log('Checking token:', storedToken);
    console.log('Survey ID from URL:', surveyIdFromUrl);

    if (!storedToken) {
      // No token, redirect to verification with survey_id
      console.log('No token found, redirecting to verification');
      sessionStorage.removeItem('graduate_profile');
      const redirectUrl = surveyIdFromUrl 
        ? `/survey-verify?survey_id=${surveyIdFromUrl}`
        : '/survey-verify';
      
      setMsgBox({
        isOpen: true,
        type: 'warning',
        message: 'Please verify your identity first',
        title: 'Verification Required'
      });
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 2000);
      return;
    }

    try {
      console.log('Validating token with backend...');
      // Validate token with backend
      const tokenResponse = await fetch(`${API_ROOT}/surveys/validate-token.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: storedToken })
      });

      const tokenResult = await tokenResponse.json();
      console.log('Token validation result:', tokenResult);

      if (!tokenResult.success) {
        console.log('Token validation failed');
        setMsgBox({
          isOpen: true,
          type: 'error',
          message: tokenResult.message || 'Invalid or expired token',
          title: 'Access Denied'
        });
        sessionStorage.removeItem('survey_token');
        sessionStorage.removeItem('graduate_id');
        sessionStorage.removeItem('graduate_name');
        sessionStorage.removeItem('graduate_profile');
        
        const redirectUrl = surveyIdFromUrl 
          ? `/survey-verify?survey_id=${surveyIdFromUrl}`
          : '/survey-verify';
        
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 2000);
        return;
      }

      // Token is valid
      console.log('Token is valid!');
      const tokenSurveyId = tokenResult?.data?.survey_id ? String(tokenResult.data.survey_id) : '';
      if (surveyIdFromUrl && tokenSurveyId && tokenSurveyId !== surveyIdFromUrl) {
        sessionStorage.removeItem('survey_token');
        sessionStorage.removeItem('graduate_id');
        sessionStorage.removeItem('graduate_name');
        sessionStorage.removeItem('graduate_profile');

        setMsgBox({
          isOpen: true,
          type: 'warning',
          message: 'Please verify your identity for this survey.',
          title: 'Verification Required'
        });

        setTimeout(() => {
          window.location.href = `/survey-verify?survey_id=${surveyIdFromUrl}`;
        }, 1500);
        return;
      }

      setToken(storedToken);
      const verifiedGraduateId = Number(tokenResult?.data?.graduate_id || storedGraduateId || 0);
      setGraduateId(verifiedGraduateId || null);
      setGraduateName(storedGraduateName || tokenResult?.data?.graduate_name || '');
      setTokenProfileData({
        ...(parsedStoredProfile || {}),
        ...(tokenResult?.data?.profile || {}),
        student_id: tokenResult?.data?.profile?.student_id || tokenResult?.data?.student_id || parsedStoredProfile?.student_id || null,
      });

      // Fetch survey
      await fetchActiveSurvey(tokenSurveyId || surveyIdFromUrl);
    } catch (error) {
      console.error('Token validation error:', error);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Error validating access. Please try again.',
        title: 'Validation Error'
      });
      setLoading(false);
    }
  };

  // Load any saved draft, then fill blank profile fields from the verified registrar record.
  useEffect(() => {
    if (!activeSurvey || !tokenProfileData || !graduateId) {
      return;
    }

    const draftKey = getSurveyDraftKey(activeSurvey.id, graduateId);
    if (hydratedDraftKeyRef.current === draftKey) {
      return;
    }

    hydratedDraftKeyRef.current = draftKey;

    const saved = localStorage.getItem(draftKey);
    let initialResponses: SurveyResponses = {};

    if (saved) {
      try {
        const draft = JSON.parse(saved);
        initialResponses = sanitizeDraftResponses(draft.responses, activeSurvey.questions);
        setCurrentSection(draft.section || 0);
        if (draft.timestamp) {
          setLastSaved(new Date(draft.timestamp));
        }
      } catch {
        localStorage.removeItem(draftKey);
      }
    }

    const autofill = applyGraduateAutofill(activeSurvey.questions, tokenProfileData, initialResponses);
    setResponses(autofill.responses);
    setAutoFilledQuestionIds(new Set(autofill.filledQuestionIds));
  }, [activeSurvey, tokenProfileData, graduateId]);

  // Auto-save draft
  useEffect(() => {
    if (activeSurvey && graduateId && Object.keys(responses).length > 0) {
      const draftKey = getSurveyDraftKey(activeSurvey.id, graduateId);
      const draft = { responses, section: currentSection, timestamp: new Date().toISOString() };
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setLastSaved(new Date());
    }
  }, [responses, currentSection, activeSurvey, graduateId]);

  const fetchActiveSurvey = async (targetSurveyId?: string | number | null) => {
    try {
      if (targetSurveyId) {
        const detailResponse = await fetch(`${API_ROOT}/surveys/index.php?id=${targetSurveyId}`);
        const detailResult = await detailResponse.json();

        if (detailResult.success && detailResult.data?.status === 'active') {
          const survey = detailResult.data;
          survey.questions = (survey.questions || []).map((q: Question) => ({
            ...q,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
          }));
          setActiveSurvey(survey);
        }
        return;
      }

      const response = await fetch(`${API_ROOT}/surveys/index.php`);
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        // Find the first active survey
        const active = result.data.find((s: Survey) => s.status === 'active');
        
        if (active) {
          // Fetch full survey details with questions
          const detailResponse = await fetch(`${API_ROOT}/surveys/index.php?id=${active.id}`);
          const detailResult = await detailResponse.json();
          
          if (detailResult.success) {
            const survey = detailResult.data;
            survey.questions = (survey.questions || []).map((q: Question) => ({
              ...q,
              options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            }));
            setActiveSurvey(survey);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching survey:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (questionId: number, value: SurveyAnswer) => {
    setAutoFilledQuestionIds(prev => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
    setResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const handleCheckboxChange = (questionId: number, option: string) => {
    setAutoFilledQuestionIds(prev => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
    setResponses(prev => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId].map(String) : [];
      const isSelected = isOtherOption(option)
        ? current.some((value) => isOtherStoredValue(value, option))
        : current.includes(option);
      const updated = isSelected
        ? current.filter((value) => (isOtherOption(option) ? !isOtherStoredValue(value, option) : value !== option))
        : [...current, option];
      return { ...prev, [questionId]: updated };
    });
  };

  const handleSingleOtherTextChange = (questionId: number, option: string, text: string) => {
    handleResponseChange(questionId, buildOtherAnswer(option, text));
  };

  const handleCheckboxOtherTextChange = (questionId: number, option: string, text: string) => {
    setAutoFilledQuestionIds(prev => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
    setResponses(prev => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId].map(String) : [];
      const withoutOther = current.filter((value) => !isOtherStoredValue(value, option));
      return { ...prev, [questionId]: [...withoutOther, buildOtherAnswer(option, text)] };
    });
  };

  const extractSurveyProfileData = (): AccountPrefillData => {
    const prefill: AccountPrefillData = {
      first_name: String(tokenProfileData?.first_name || '').trim(),
      middle_name: String(tokenProfileData?.middle_name || '').trim(),
      last_name: String(tokenProfileData?.last_name || '').trim(),
      email: String(tokenProfileData?.email || '').trim(),
      phone: String(tokenProfileData?.phone || '').trim(),
      year_graduated: tokenProfileData?.year_graduated ? String(tokenProfileData.year_graduated) : '',
      address: String(tokenProfileData?.address || '').trim(),
      program_id: tokenProfileData?.program_id ? Number(tokenProfileData.program_id) : null,
      program_name: String(tokenProfileData?.program_name || tokenProfileData?.program_code || '').trim(),
    };

    const questionMap = new Map<number, Question>();
    (activeSurvey?.questions || []).forEach((q) => {
      if (q.id) {
        questionMap.set(q.id, q);
      }
    });

    Object.entries(responses).forEach(([questionId, answer]) => {
      const q = questionMap.get(Number(questionId));
      if (!q || isHeaderQuestion(q) || answer === null || answer === undefined) {
        return;
      }

      const questionText = q.question_text.toLowerCase();
      const value = Array.isArray(answer) ? answer.join(', ') : String(answer).trim();
      if (!value) {
        return;
      }

      if (questionText.includes('first name') || questionText.includes('given name')) {
        prefill.first_name = value;
      } else if (questionText.includes('middle name')) {
        prefill.middle_name = value;
      } else if (questionText.includes('last name')) {
        prefill.last_name = value;
      } else if (questionText.includes('email') || questionText.includes('e-mail')) {
        prefill.email = value;
      } else if (questionText.includes('mobile') || questionText.includes('contact number') || questionText.includes('contact no') || questionText.includes('contact #') || questionText.includes('telephone') || questionText.includes('phone') || questionText.includes('cellphone') || questionText.includes('cp number')) {
        if (!prefill.phone) {
          prefill.phone = value;
        }
      } else if (questionText.includes('year graduated') || questionText.includes('year of graduation') || questionText.includes('yr graduated') || questionText.includes('graduation year')) {
        prefill.year_graduated = value;
      } else if (questionText.includes('degree program') || questionText.includes('degree/course') || questionText.includes('degree / course') || questionText.includes('course') || questionText.includes('program completed') || questionText.includes('course completed')) {
        if (!prefill.program_name) {
          prefill.program_name = value;
        }
      } else if (
        questionText.includes('address')
        || questionText.includes('barangay')
        || questionText.includes('city')
        || questionText.includes('municipality')
        || questionText.includes('province')
      ) {
        prefill.address = prefill.address ? `${prefill.address}, ${value}` : value;
      }
    });

    // Pattern-based fallback to catch fields even when question labels are custom.
    const allAnswerValues = Object.values(responses)
      .flatMap((raw) => (Array.isArray(raw) ? raw : [raw]))
      .map((raw) => String(raw ?? '').trim())
      .filter(Boolean);

    if (!prefill.email) {
      const detectedEmail = allAnswerValues.find((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
      if (detectedEmail) {
        prefill.email = detectedEmail;
      }
    }

    if (!prefill.phone) {
      const phoneRegex = /^(?:\+63|0)?9\d{9}$|^(?:\+63\s?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}$/;
      const compact = (value: string) => value.replace(/[\s()-]/g, '');
      const detectedPhone = allAnswerValues.find((value) => phoneRegex.test(compact(value)));
      if (detectedPhone) {
        prefill.phone = detectedPhone;
      }
    }

    if (!prefill.year_graduated) {
      const detectedYear = allAnswerValues.find((value) => /^(19|20)\d{2}$/.test(value));
      if (detectedYear) {
        prefill.year_graduated = detectedYear;
      }
    }

    const fullNameParts = (graduateName || '').trim().split(' ').filter(Boolean);
    if (!prefill.first_name && fullNameParts.length > 0) {
      prefill.first_name = fullNameParts[0];
    }
    if (!prefill.last_name && fullNameParts.length > 1) {
      prefill.last_name = fullNameParts[fullNameParts.length - 1];
    }
    if (!prefill.middle_name && fullNameParts.length > 2) {
      prefill.middle_name = fullNameParts.slice(1, fullNameParts.length - 1).join(' ');
    }

    return prefill;
  };

  const finishSurveyFlow = (goHome: boolean = true) => {
    setPostSubmitModalOpen(false);
    setShowCreateAccountForm(false);
    setAccountPassword('');
    setAccountConfirmPassword('');
    setShowAccountPassword(false);
    setShowAccountConfirmPassword(false);
    setSubmittedResponseId(null);
    setPrefillData(null);
    setResponses({});
    setAutoFilledQuestionIds(new Set());
    setCurrentSection(0);
    setAgreed(false);
    setLastSaved(null);

    if (goHome) {
      setTimeout(() => {
        window.location.href = '/';
      }, 1200);
    }
  };

  const handleCreateGraduateAccount = async () => {
    if (!prefillData || !submittedResponseId || !graduateId) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Cannot Create Account',
        message: 'Missing submission reference. Please sign up later from the graduate portal.',
      });
      return;
    }

    if (!prefillData.email) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Email Required',
        message: 'Your survey response did not include an email address. Please provide an email in the survey next time or contact the registrar.',
      });
      return;
    }

    if (!PASSWORD_COMPLEXITY_REGEX.test(accountPassword)) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Weak Password',
        message: 'Password must be 8 or more characters and include uppercase, lowercase, number, and symbol.',
      });
      return;
    }

    if (accountPassword !== accountConfirmPassword) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Password Mismatch',
        message: 'Password and confirm password must match.',
      });
      return;
    }

    setAccountSubmitting(true);
    try {
      const response = await fetch(API_ENDPOINTS.GRADUATE_AUTH.REGISTER_FROM_SURVEY, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survey_response_id: submittedResponseId,
          graduate_id: graduateId,
          email: prefillData.email,
          phone: prefillData.phone,
          year_graduated: prefillData.year_graduated ? Number(prefillData.year_graduated) : null,
          address: prefillData.address,
          program_id: prefillData.program_id,
          password: accountPassword,
          confirm_password: accountConfirmPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const suggestion = result.suggestion ? `\n\n${result.suggestion}` : '';
        setMsgBox({
          isOpen: true,
          type: 'error',
          title: 'Account Creation Failed',
          message: `${result.error || 'Unable to create account right now.'}${suggestion}`,
        });
        return;
      }

      setMsgBox({
        isOpen: true,
        type: 'success',
        title: 'Account Created',
        message: 'Your GradTrack account was created successfully. Redirecting to Graduate Portal...',
      });

      setTimeout(() => {
        window.location.href = '/graduate/portal';
      }, 1200);
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Network Error',
        message: error instanceof Error ? error.message : 'Unable to create account. Please try again later.',
      });
    } finally {
      setAccountSubmitting(false);
    }
  };

  // Validate current section before moving to next
  const validateCurrentSection = () => {
    const requiredQuestions = currentSectionQuestions.filter(
      q => !isHeaderQuestion(q) && Number(q.is_required) === 1
    );
    
    for (const question of requiredQuestions) {
      const answer = responses[question.id!];
      
      // Check if answer is empty, null, undefined, or empty array
      if (!answer || 
          (Array.isArray(answer) && answer.length === 0) || 
          (typeof answer === 'string' && answer.trim() === '')) {
        setMsgBox({ isOpen: true, type: 'warning', message: `Please answer the required question: "${question.question_text}"`, title: 'Required Field' });
        return false;
      }
    }

    const blankOtherQuestion = currentSectionQuestions.find(
      q => !isHeaderQuestion(q) && hasBlankOtherSelection(q, responses[q.id!])
    );

    if (blankOtherQuestion) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        message: `Please specify your answer for "Other" in: "${blankOtherQuestion.question_text}"`,
        title: 'Other Answer Required'
      });
      return false;
    }
    
    return true;
  };

  const handleSubmit = async () => {
    if (!activeSurvey || !token || !graduateId) return;

    const submissionResponses = sanitizeDraftResponses(responses, activeSurvey.questions);

    try {
      const response = await fetch(`${API_ROOT}/surveys/responses.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survey_id: activeSurvey.id,
          graduate_id: graduateId,
          token: token,
          responses: submissionResponses,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const extractedProfile = extractSurveyProfileData();

        localStorage.removeItem(getSurveyDraftKey(activeSurvey.id, graduateId));
        localStorage.removeItem(`survey_draft_${activeSurvey.id}`);
        sessionStorage.removeItem('survey_token');
        sessionStorage.removeItem('graduate_id');
        sessionStorage.removeItem('graduate_name');
        sessionStorage.removeItem('graduate_profile');

        setSubmittedResponseId(result.survey_response_id || result.id || null);
        setPrefillData(extractedProfile);
        setPostSubmitModalOpen(true);
        setShowCreateAccountForm(false);
      } else {
        const errorMsg = result.error || 'Unknown error occurred';
        const hint = result.hint || '';
        setMsgBox({ isOpen: true, type: 'error', message: `Error: ${errorMsg}\n\n${hint}`, title: 'Submission Error' });
        console.error('Survey submission error:', result);
      }
    } catch (error) {
      console.error('Error submitting survey:', error);
      setMsgBox({ isOpen: true, type: 'error', message: 'Error submitting survey. Please check your internet connection and try again.', title: 'Network Error' });
    }
  };

  const getQuestionFieldClass = (question: Question) => {
    const wasAutoFilled = question.id ? autoFilledQuestionIds.has(question.id) : false;
    const colorClass = wasAutoFilled
      ? 'border-green-300 bg-green-50 focus:ring-green-500 focus:border-green-400'
      : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-transparent';

    return `w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition text-sm ${colorClass}`;
  };

  const autoFilledCount = autoFilledQuestionIds.size;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed relative flex items-center justify-center" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
        </div>
      </div>
    );
  }

  // No active survey
  if (!activeSurvey) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed relative flex flex-col items-center justify-center p-4 sm:p-6" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
        <div className="flex justify-center mb-6 relative z-10">
          <img src="/Gradtrack_Logo2.png" alt="GradTrack Logo" className="h-20 object-contain" />
        </div>
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-5 border border-blue-100 relative z-10 text-center sm:p-10">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-blue-900 mb-4 sm:text-3xl">No Active Survey</h1>
          <p className="text-gray-600 mb-6">There are currently no active surveys available. Please check back later.</p>
          <Link to="/" className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // ─── DATA PRIVACY CONSENT ───
  if (!agreed) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed relative flex flex-col items-center justify-center p-4 sm:p-6" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
        <div className="flex justify-center mb-6 relative z-10">
          <img
            src="/Gradtrack_Logo2.png"
            alt="GradTrack Logo"
            className="h-20 object-contain"
          />
        </div>
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-5 border border-blue-100 relative z-10 sm:p-10">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600 p-4 rounded-full">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-blue-900 text-center mb-2 sm:text-3xl">
            Data Privacy Notice & Informed Consent
          </h1>
          <div className="mt-6 bg-blue-50 rounded-xl p-4 border border-blue-100 sm:p-6">
            <p className="text-gray-700 leading-relaxed text-sm">
              By proceeding with this form, you voluntarily consent to participate in this research. The information you provide will be collected and processed in accordance with the <strong>Data Privacy Act of 2012 (RA 10173)</strong> and will be used for academic research purposes only. Your responses will be kept confidential, reported in aggregated form, and accessed only by the researcher. Participation is voluntary.
            </p>
          </div>
          <div className="mt-6 flex items-start space-x-3">
            <input
              type="checkbox"
              id="agreeCheckbox"
              checked={agreedCheckbox}
              onChange={(e) => setAgreedCheckbox(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="agreeCheckbox" className="text-gray-700 text-sm cursor-pointer">
              I have read and understood the Data Privacy Notice and I voluntarily consent to participate in this survey.
            </label>
          </div>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setAgreed(true)}
              disabled={!agreedCheckbox}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg disabled:shadow-none"
            >
              I Agree & Proceed
            </button>
            <Link
              to="/"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-8 py-3 rounded-lg font-semibold transition text-center"
            >
              Decline & Go Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Progress Bar
  const ProgressBar = () => (
    <div className="w-full max-w-5xl mx-auto mb-6 overflow-x-auto pb-2 sm:mb-10">
      <div className="flex min-w-max items-start justify-between gap-2 px-1 sm:min-w-0 sm:gap-0">
        {allSections.map((section, i) => (
          <div key={i} className="relative flex w-24 flex-col items-center sm:flex-1">
            <div
              aria-current={i === currentSection ? 'step' : undefined}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm select-none z-10 ${
                i < currentSection
                  ? 'bg-green-500 text-white'
                  : i === currentSection
                  ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < currentSection ? '✓' : i + 1}
            </div>
            <span className={`text-xs mt-2 font-medium text-center max-w-[100px] truncate ${i === currentSection ? 'text-yellow-400' : 'text-blue-200'}`} title={section}>
              {section}
            </span>
            {i < allSections.length - 1 && (
              <div className={`absolute top-5 left-[55%] w-full h-0.5 ${i < currentSection ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Render question based on type
  const renderQuestion = (question: Question) => {
    const value = responses[question.id!] || '';

    switch (question.question_type) {
      case 'header':
        return null;

      case 'text':
        if (isNameExtensionQuestion(question)) {
          const normalizedValue = typeof value === 'string' ? value : '';
          return (
            <select
              value={normalizedValue}
              onChange={(e) => handleResponseChange(question.id!, e.target.value)}
              className={getQuestionFieldClass(question)}
              required={Number(question.is_required) === 1}
            >
              <option value="">Select name extension</option>
              {NAME_EXTENSION_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          );
        }

        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleResponseChange(question.id!, e.target.value)}
            className={getQuestionFieldClass(question)}
            required={question.is_required === 1}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleResponseChange(question.id!, e.target.value)}
            className={getQuestionFieldClass(question)}
            required={question.is_required === 1}
          />
        );

      case 'multiple_choice':
      {
        const otherOption = getOtherOption(question);
        const selectValue = otherOption && typeof value === 'string' && isOtherStoredValue(value, otherOption)
          ? otherOption
          : (typeof value === 'string' || typeof value === 'number' ? value : '');
        const showOtherInput = otherOption && typeof value === 'string' && isOtherStoredValue(value, otherOption);

        return (
          <div className="space-y-2">
            <select
              value={selectValue}
              onChange={(e) => handleResponseChange(question.id!, e.target.value)}
              className={getQuestionFieldClass(question)}
              required={Number(question.is_required) === 1}
            >
              <option value="">Select an option</option>
              {question.options?.map((option, idx) => (
                <option key={idx} value={option}>{option}</option>
              ))}
            </select>
            {showOtherInput && (
              <input
                type="text"
                value={getOtherTextFromAnswer(value, otherOption)}
                onChange={(e) => handleSingleOtherTextChange(question.id!, otherOption, e.target.value)}
                className={getQuestionFieldClass(question)}
                placeholder="Please specify"
                aria-label={`Specify other answer for ${question.question_text}`}
              />
            )}
          </div>
        );
      }

      case 'radio':
      {
        const otherOption = getOtherOption(question);

        return (
          <div className="space-y-2">
            {question.options?.map((option, idx) => {
              const isOther = isOtherOption(option);
              const checked = isOther
                ? typeof value === 'string' && isOtherStoredValue(value, option)
                : value === option;

              return (
                <div key={idx}>
                  <label className="flex items-center space-x-3 text-sm text-gray-700 cursor-pointer hover:bg-blue-100 p-2 rounded-lg transition">
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={option}
                      checked={checked}
                      onChange={(e) => handleResponseChange(question.id!, e.target.value)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      required={Number(question.is_required) === 1}
                    />
                    <span>{option}</span>
                  </label>
                  {isOther && checked && otherOption && (
                    <div className="ml-7 mt-2">
                      <input
                        type="text"
                        value={getOtherTextFromAnswer(value, otherOption)}
                        onChange={(e) => handleSingleOtherTextChange(question.id!, otherOption, e.target.value)}
                        className={getQuestionFieldClass(question)}
                        placeholder="Please specify"
                        aria-label={`Specify other answer for ${question.question_text}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case 'checkbox': {
        const selectedValues = Array.isArray(value) ? value.map(String) : [];
        const otherOption = getOtherOption(question);

        return (
          <div className="space-y-2">
            {question.options?.map((option, idx) => {
              const isOther = isOtherOption(option);
              const checked = isOther
                ? selectedValues.some((selectedValue) => isOtherStoredValue(selectedValue, option))
                : selectedValues.includes(option);

              return (
                <div key={idx}>
                  <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleCheckboxChange(question.id!, option)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{option}</span>
                  </label>
                  {isOther && checked && otherOption && (
                    <div className="ml-6 mt-2">
                      <input
                        type="text"
                        value={getOtherTextFromAnswer(value, otherOption)}
                        onChange={(e) => handleCheckboxOtherTextChange(question.id!, otherOption, e.target.value)}
                        className={getQuestionFieldClass(question)}
                        placeholder="Please specify"
                        aria-label={`Specify other answer for ${question.question_text}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case 'rating':
        return (
          <div className="flex space-x-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => handleResponseChange(question.id!, rating)}
                className={`px-4 py-2 rounded-lg border-2 transition ${
                  value === rating
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {rating}
              </button>
            ))}
          </div>
        );

      default:
        return (
          <textarea
            value={value}
            onChange={(e) => handleResponseChange(question.id!, e.target.value)}
            rows={4}
            className={getQuestionFieldClass(question)}
            required={question.is_required === 1}
          />
        );
    }
  };

  // Get unique sections from all questions
  const allSections: string[] = [];
  const sectionQuestions: Record<string, Question[]> = {};
  
  activeSurvey?.questions.forEach(q => {
    const section = q.section || 'General';
    if (!allSections.includes(section)) {
      allSections.push(section);
    }
    if (!sectionQuestions[section]) {
      sectionQuestions[section] = [];
    }
    sectionQuestions[section].push(q);
  });

  const totalPages = allSections.length;
  const currentSectionName = allSections[currentSection] || 'General';
  
  // Filter questions based on conditional logic
  const getFilteredQuestions = () => {
    const questions = sectionQuestions[currentSectionName] || [];
    const filtered: Question[] = [];

    const employedQuestion = activeSurvey?.questions.find((question) =>
      question.question_text.toLowerCase().includes('are you presently employed')
    );
    const employedAnswer = employedQuestion?.id ? responses[employedQuestion.id] : null;
    const employedAnswerText = typeof employedAnswer === 'string' ? employedAnswer.toLowerCase() : '';
    const isEmploymentSection = currentSectionName.toLowerCase() === 'employment data';
    
    questions.forEach((q) => {
      if (!isEmploymentSection || !employedQuestion?.id) {
        filtered.push(q);
        return;
      }

      const questionText = q.question_text.toLowerCase();

      // Always show the controlling question.
      if (q.id === employedQuestion.id) {
        filtered.push(q);
        return;
      }

      const isNotEmployedReasonQuestion = questionText.includes('reason(s) why you are not yet employed');

      // Show only unemployment reason when answer is No.
      if (isNotEmployedReasonQuestion) {
        if (employedAnswerText === 'no') {
          filtered.push(q);
        }
        return;
      }

      // All other employment questions are for employed respondents.
      if (employedAnswerText === 'yes') {
        filtered.push(q);
      }
    });
    
    return filtered;
  };
  
  const currentSectionQuestions = getFilteredQuestions();

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed relative" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
      {/* Header */}
      <nav className="bg-blue-900/95 backdrop-blur-sm shadow-lg sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <img src="/logo.png" alt="Norzagaray College" className="h-10 w-10 object-contain" />
              <h1 className="text-lg font-bold text-white">GradTrack Survey</h1>
            </div>
            <Link to="/" className="text-white hover:text-yellow-400 font-medium transition text-sm">
              ← Back to Home
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 relative">
        <div className="flex justify-center mb-6">
          <img
            src="/Gradtrack_Logo2.png"
            alt="GradTrack Logo"
            className="h-20 object-contain"
          />
        </div>
        <ProgressBar />

        <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-blue-900 sm:text-2xl">{activeSurvey.title}</h2>
              {graduateName && (
                <p className="text-green-600 font-medium mt-1">Welcome, {graduateName}!</p>
              )}
              {activeSurvey.description && (
                <p className="text-gray-600 mt-2">{activeSurvey.description}</p>
              )}
            </div>
            {lastSaved && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
                <Save className="w-4 h-4" />
                <span>Draft saved</span>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {autoFilledCount > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Some fields were filled from your registrar record. You can still edit them before submitting.
              </div>
            )}

            {/* Section Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 mb-4 shadow-md">
              <h3 className="text-xl font-bold text-white uppercase tracking-wide">
                {currentSectionName}
              </h3>
            </div>
            
            {/* Questions in this section */}
            <div className="space-y-6">
              {(() => {
                const renderedQuestions: JSX.Element[] = [];
                let i = 0;
                
                while (i < currentSectionQuestions.length) {
                  const question = currentSectionQuestions[i];
                  const globalIdx = activeSurvey.questions.findIndex(q => q.id === question.id);
                  const questionText = question.question_text.toLowerCase();

                  if (isHeaderQuestion(question)) {
                    const { title, suffix } = splitHeaderText(question.question_text);

                    renderedQuestions.push(
                      <div key={`header-${question.id || i}`} className="bg-white rounded-lg p-5 border border-gray-200">
                        <p className="text-base text-gray-900">
                          <span className="font-bold">{globalIdx + 1}. {title}</span>
                          {suffix && <span className="italic"> {suffix}</span>}
                        </p>
                      </div>
                    );
                    i++;
                    continue;
                  }
                  
                  // Check if this is Last Name and next two are First Name and Middle Name
                  if (questionText.includes('last name') &&
                      i + 2 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('first name') &&
                      currentSectionQuestions[i + 2].question_text.toLowerCase().includes('middle name')) {
                    
                    const firstNameQ = currentSectionQuestions[i + 1];
                    const middleNameQ = currentSectionQuestions[i + 2];
                    const maybeNameExtensionQ = currentSectionQuestions[i + 3];
                    const hasNameExtension = Boolean(
                      maybeNameExtensionQ
                      && maybeNameExtensionQ.question_text.toLowerCase().includes('name extension')
                    );
                    const firstNameIdx = activeSurvey.questions.findIndex(q => q.id === firstNameQ.id);
                    const middleNameIdx = activeSurvey.questions.findIndex(q => q.id === middleNameQ.id);
                    const nameExtensionIdx = hasNameExtension
                      ? activeSurvey.questions.findIndex(q => q.id === maybeNameExtensionQ?.id)
                      : -1;
                    
                    renderedQuestions.push(
                      <div key={`name-group-${question.id}`} className="bg-blue-50 rounded-xl p-4 border border-blue-100 sm:p-5">
                        <div className={`grid grid-cols-1 gap-4 ${hasNameExtension ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {Number(question.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {firstNameIdx + 1}. {firstNameQ.question_text}
                              {Number(firstNameQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(firstNameQ)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {middleNameIdx + 1}. {middleNameQ.question_text}
                              {Number(middleNameQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(middleNameQ)}
                          </div>
                          {hasNameExtension && maybeNameExtensionQ && (
                            <div>
                              <label className="block text-base font-semibold text-gray-800 mb-3">
                                {nameExtensionIdx + 1}. {maybeNameExtensionQ.question_text}
                                {Number(maybeNameExtensionQ.is_required) === 1 && (
                                  <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                                )}
                              </label>
                              {renderQuestion(maybeNameExtensionQ)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    i += hasNameExtension ? 4 : 3;
                  }
                  // Check if this is Email and next two are Mobile Number and Telephone/Contact Number
                  else if (questionText.includes('email') &&
                      i + 2 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('mobile') &&
                      (currentSectionQuestions[i + 2].question_text.toLowerCase().includes('telephone') ||
                       currentSectionQuestions[i + 2].question_text.toLowerCase().includes('contact number'))) {
                    
                    const mobileQ = currentSectionQuestions[i + 1];
                    const telephoneQ = currentSectionQuestions[i + 2];
                    const mobileIdx = activeSurvey.questions.findIndex(q => q.id === mobileQ.id);
                    const telephoneIdx = activeSurvey.questions.findIndex(q => q.id === telephoneQ.id);
                    
                    renderedQuestions.push(
                      <div key={`contact-group-${question.id}`} className="bg-blue-50 rounded-xl p-4 border border-blue-100 sm:p-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {Number(question.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {mobileIdx + 1}. {mobileQ.question_text}
                              {Number(mobileQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(mobileQ)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {telephoneIdx + 1}. {telephoneQ.question_text}
                              {Number(telephoneQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(telephoneQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 3;
                  }
                  // Check if this is Civil Status and next two are Sex and Birthday
                  else if (questionText.includes('civil status') &&
                      i + 2 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('sex') &&
                      (currentSectionQuestions[i + 2].question_text.toLowerCase().includes('birthday') ||
                       currentSectionQuestions[i + 2].question_text.toLowerCase().includes('birth date') ||
                       currentSectionQuestions[i + 2].question_text.toLowerCase().includes('date of birth'))) {
                    
                    const sexQ = currentSectionQuestions[i + 1];
                    const birthdayQ = currentSectionQuestions[i + 2];
                    const sexIdx = activeSurvey.questions.findIndex(q => q.id === sexQ.id);
                    const birthdayIdx = activeSurvey.questions.findIndex(q => q.id === birthdayQ.id);
                    
                    renderedQuestions.push(
                      <div key={`personal-group-${question.id}`} className="bg-blue-50 rounded-xl p-4 border border-blue-100 sm:p-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {Number(question.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {sexIdx + 1}. {sexQ.question_text}
                              {Number(sexQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(sexQ)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {birthdayIdx + 1}. {birthdayQ.question_text}
                              {Number(birthdayQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(birthdayQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 3;
                  }
                  // Check if this is Region and next two are Province and City/Municipality
                  else if (questionText.includes('region') &&
                      i + 2 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('province') &&
                      (currentSectionQuestions[i + 2].question_text.toLowerCase().includes('city') ||
                       currentSectionQuestions[i + 2].question_text.toLowerCase().includes('municipality'))) {
                    
                    const provinceQ = currentSectionQuestions[i + 1];
                    const cityQ = currentSectionQuestions[i + 2];
                    const provinceIdx = activeSurvey.questions.findIndex(q => q.id === provinceQ.id);
                    const cityIdx = activeSurvey.questions.findIndex(q => q.id === cityQ.id);
                    
                    renderedQuestions.push(
                      <div key={`address-group-${question.id}`} className="bg-blue-50 rounded-xl p-4 border border-blue-100 sm:p-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {Number(question.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {provinceIdx + 1}. {provinceQ.question_text}
                              {Number(provinceQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(provinceQ)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {cityIdx + 1}. {cityQ.question_text}
                              {Number(cityQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(cityQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 3;
                  }
                  // Check if this is Degree Program and next is Year Graduated
                  else if ((questionText.includes('degree program') || questionText.includes('degree/program')) &&
                      i + 1 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('year graduated')) {
                    
                    const yearGradQ = currentSectionQuestions[i + 1];
                    const yearGradIdx = activeSurvey.questions.findIndex(q => q.id === yearGradQ.id);
                    
                    renderedQuestions.push(
                      <div key={`degree-group-${question.id}`} className="bg-blue-50 rounded-xl p-4 border border-blue-100 sm:p-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {Number(question.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {yearGradIdx + 1}. {yearGradQ.question_text}
                              {Number(yearGradQ.is_required) === 1 && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(yearGradQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 2;
                  }
                  else {
                    // Render normal question
                    renderedQuestions.push(
                      <div key={question.id} className="bg-blue-50 rounded-xl p-4 border border-blue-100 sm:p-5">
                        <label className="block text-base font-semibold text-gray-800 mb-3">
                          {globalIdx + 1}. {question.question_text}
                          {Number(question.is_required) === 1 && (
                            <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                          )}
                        </label>
                        {renderQuestion(question)}
                      </div>
                    );
                    i++;
                  }
                }
                
                return renderedQuestions;
              })()}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex flex-col-reverse gap-3 mt-8 pt-6 border-t border-gray-100 sm:mt-10 sm:flex-row sm:justify-between">
            <button
              onClick={() => setCurrentSection(prev => prev - 1)}
              disabled={currentSection === 0}
              className={`flex w-full items-center justify-center space-x-2 px-6 py-3 rounded-lg font-semibold transition sm:w-auto ${
                currentSection === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Previous</span>
            </button>

            {currentSection < totalPages - 1 ? (
              <button
                onClick={() => {
                  if (validateCurrentSection()) {
                    setCurrentSection(prev => prev + 1);
                  }
                }}
                className="flex w-full items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg sm:w-auto"
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (validateCurrentSection()) {
                    handleSubmit();
                  }
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg sm:w-auto"
              >
                Submit Survey
              </button>
            )}
          </div>
        </div>
      </div>

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        type={msgBox.type}
        message={msgBox.message}
        title={msgBox.title}
      />

      {postSubmitModalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-blue-100 overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-100 px-4 py-5 sm:px-6">
              <h3 className="text-lg font-bold text-blue-900 sm:text-xl">Your survey has been submitted successfully.</h3>
              <p className="text-sm text-gray-600 mt-1">
                Would you like to create a GradTrack account using the information you already provided?
              </p>
            </div>

            {!showCreateAccountForm ? (
              <div className="p-4 space-y-4 sm:p-6">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-1">
                  <p><span className="font-semibold">Name:</span> {prefillData?.first_name || '-'} {prefillData?.middle_name || ''} {prefillData?.last_name || ''}</p>
                  <p><span className="font-semibold">Email:</span> {prefillData?.email || '-'}</p>
                  <p><span className="font-semibold">Program:</span> {prefillData?.program_name || '-'}</p>
                  <p><span className="font-semibold">Year Graduated:</span> {prefillData?.year_graduated || '-'}</p>
                  <p><span className="font-semibold">Contact:</span> {prefillData?.phone || '-'}</p>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setShowCreateAccountForm(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-semibold transition"
                  >
                    Create Account
                  </button>
                  <button
                    onClick={() => {
                      setMsgBox({
                        isOpen: true,
                        type: 'success',
                        title: 'Survey Submitted',
                        message: 'Your response was saved. You can create an account later from the Graduate Portal.',
                      });
                      finishSurveyFlow(true);
                    }}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-semibold transition"
                  >
                    Not Now
                  </button>
                  <button
                    onClick={() => {
                      setMsgBox({
                        isOpen: true,
                        type: 'info',
                        title: 'You are logged out',
                        message: 'You may close this message or go back to home anytime.',
                      });
                      finishSurveyFlow(false);
                    }}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-semibold transition"
                  >
                    Stay Logged Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4 sm:p-6">
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-gray-600 mb-1">Name</label>
                    <input
                      type="text"
                      readOnly
                      value={`${prefillData?.first_name || ''} ${prefillData?.middle_name || ''} ${prefillData?.last_name || ''}`.trim()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1">Email</label>
                    <input
                      type="text"
                      readOnly
                      value={prefillData?.email || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1">Program</label>
                    <input
                      type="text"
                      readOnly
                      value={prefillData?.program_name || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1">Year Graduated</label>
                    <input
                      type="text"
                      readOnly
                      value={prefillData?.year_graduated || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Password</label>
                    <div className="relative">
                      <input
                        type={showAccountPassword ? 'text' : 'password'}
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        minLength={8}
                        placeholder="Min 8 chars, Aa1!"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccountPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                        aria-label={showAccountPassword ? 'Hide password' : 'Show password'}
                        title={showAccountPassword ? 'Hide password' : 'Show password'}
                      >
                        {showAccountPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showAccountConfirmPassword ? 'text' : 'password'}
                        value={accountConfirmPassword}
                        onChange={(e) => setAccountConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        minLength={8}
                        placeholder="Re-enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccountConfirmPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                        aria-label={showAccountConfirmPassword ? 'Hide password' : 'Show password'}
                        title={showAccountConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showAccountConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  Password must be at least 8 characters with uppercase, lowercase, number, and symbol.
                </p>

                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleCreateGraduateAccount}
                    disabled={accountSubmitting}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2.5 rounded-lg font-semibold transition"
                  >
                    {accountSubmitting ? 'Creating Account...' : 'Create Account'}
                  </button>
                  <button
                    onClick={() => setShowCreateAccountForm(false)}
                    disabled={accountSubmitting}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-semibold transition"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Survey;
