import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Archive, RotateCcw, Search, ChevronLeft, ChevronRight, X, ClipboardList, ChevronDown, ChevronUp, ShieldCheck, BarChart3, Briefcase, Info, Trash2, ArrowUp, ArrowDown, CalendarClock, Target,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MessageBox from '../../components/MessageBox';
import { API_ROOT } from '../../config/api';
import { analyzeGraduationYearOptions, isGraduationYearQuestion } from '../../utils/graduationYears';

const API_BASE = API_ROOT;

interface SurveyOption {
  id: number | null;
  program_id?: number | null;
  key: string | null;
  value: string;
  label: string;
  sort_order: number;
}

interface ApiSurveyOption extends Partial<SurveyOption> {
  option_key?: string | null;
  option_value?: string | null;
}

interface MasterProgramOption {
  id: number;
  code: string;
  name: string;
}

interface Question {
  id?: number;
  question_key?: string;
  analytics_key?: string | null;
  section_id?: number | null;
  question_text: string;
  question_type: string;
  options: string[] | null;
  option_definitions?: SurveyOption[];
  is_required: number;
  sort_order: number;
  section?: string;
}

interface ApiQuestion extends Omit<Question, 'options' | 'option_definitions'> {
  options: string[] | string | null;
  option_definitions?: ApiSurveyOption[];
}

interface Survey {
  id: number;
  template_id?: number | null;
  title: string;
  description: string;
  status: string;
  question_count: number;
  response_count: number;
  created_at: string;
  questions?: Question[];
  archived_at?: string | null;
  archived_by_name?: string | null;
  restored_at?: string | null;
  restored_by_name?: string | null;
  published_at?: string | null;
  deadline_at?: string | null;
  target_type: TargetType;
  total_response_target?: number | null;
  completion_reason?: string | null;
  completion_message?: string | null;
  target_completion_suppressed?: boolean | number;
  target_progress?: TargetProgress;
  program_targets?: ProgramTargetProgress[];
}

type TargetType = 'none' | 'total' | 'program';

interface ProgramTargetProgress {
  program_id: number;
  program_code: string;
  program_name: string;
  target: number;
  submitted: number;
  remaining: number;
  progress_percent: number;
  reached: boolean;
}

interface TargetProgress {
  target_type: TargetType;
  configured_target: number | null;
  total_target: number | null;
  valid_responses: number;
  target_progress_count?: number;
  remaining: number | null;
  progress_percent: number | null;
  target_reached: boolean;
  target_completion_suppressed: boolean;
  programs: ProgramTargetProgress[];
}

interface FormData {
  id?: number;
  template_id?: number | null;
  response_count?: number;
  question_definitions_locked?: boolean;
  title: string;
  description: string;
  status: string;
  original_status?: string;
  published_at?: string | null;
  created_at?: string | null;
  deadline_at: string;
  target_type: TargetType;
  total_response_target: string;
  program_targets: Record<number, string>;
  reactivation_reason: string;
  questions: Question[];
}

const emptyForm: FormData = {
  title: '', description: '', status: 'draft', deadline_at: '', target_type: 'none',
  total_response_target: '', program_targets: {}, reactivation_reason: '', questions: [],
};

const statusStyle: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  draft: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
};

const MANILA_TIME_ZONE = 'Asia/Manila';

const toDateTimeLocalValue = (value?: string | null) => (
  value ? value.replace(' ', 'T').slice(0, 16) : ''
);

const manilaDate = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(`${normalized.replace(/(?:Z|[+-]\d{2}:\d{2})$/, '')}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatManilaDateTime = (value?: string | null) => {
  const parsed = manilaDate(value);
  if (!parsed) return 'Not set';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(parsed);
};

const getManilaDateTimeLocalNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};

const isProfessionalExamHeader = (question: Question) =>
  question.question_text.toLowerCase().startsWith('professional examination(s) passed');

const isHeaderQuestion = (question: Question) =>
  question.question_type === 'header' || isProfessionalExamHeader(question);

const getQuestionDisplayText = (question: Question) =>
  isProfessionalExamHeader(question) && !question.question_text.toLowerCase().includes('if applicable')
    ? `${question.question_text} (if applicable)`
    : question.question_text;

const getAnswerableQuestionCount = (questions?: Question[], fallback = 0) =>
  questions ? questions.filter((question) => !isHeaderQuestion(question)).length : fallback;

const getDisplayQuestionNumber = (questions: Question[], index: number) =>
  questions.slice(0, index + 1).filter((question) => !isHeaderQuestion(question)).length;

const normalizeQuestionLabel = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const ensurePermanentAddressSubheader = (questions: Question[]) => {
  const alreadyConfigured = questions.some((question) => (
    isHeaderQuestion(question)
    && (
      question.analytics_key === 'permanent_address'
      || normalizeQuestionLabel(question.question_text).includes('permanent address')
    )
  ));
  if (alreadyConfigured) return questions;

  const addressFieldIndexes = ['region', 'province', 'city_municipality', 'barangay'].map((analyticsKey) => (
    questions.findIndex((question) => {
      if (question.analytics_key === analyticsKey) return true;
      const label = normalizeQuestionLabel(question.question_text);
      if (analyticsKey === 'city_municipality') {
        return label.includes('city') || label.includes('municipality');
      }
      return label === analyticsKey;
    })
  ));
  if (addressFieldIndexes.some((index) => index < 0)) return questions;

  const firstAddressIndex = Math.min(...addressFieldIndexes);
  const addressSection = questions[firstAddressIndex]?.section || '';
  if (
    !normalizeQuestionLabel(addressSection).includes('personal information')
    || !addressFieldIndexes.every((index) => questions[index]?.section === addressSection)
  ) {
    return questions;
  }

  const withSubheader = [...questions];
  withSubheader.splice(firstAddressIndex, 0, {
    analytics_key: 'permanent_address',
    question_text: 'Permanent Address',
    question_type: 'header',
    options: null,
    option_definitions: [],
    is_required: 0,
    sort_order: firstAddressIndex + 1,
    section: addressSection,
  });

  return withSubheader.map((question, index) => ({ ...question, sort_order: index + 1 }));
};

export default function Surveys() {
  const [routeSearchParams, setRouteSearchParams] = useSearchParams();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [expandedSurvey, setExpandedSurvey] = useState<number | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [archiveView, setArchiveView] = useState<'active' | 'archived'>(
    routeSearchParams.get('archive') === 'archived' ? 'archived' : 'active'
  );
  const [archiveCounts, setArchiveCounts] = useState({ active: 0, archived: 0 });
  const [coverageWarning, setCoverageWarning] = useState('');
  const [masterPrograms, setMasterPrograms] = useState<MasterProgramOption[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, pages: 1 });
  const navigate = useNavigate();
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'confirm' | 'success' | 'error' | 'warning';
    title?: string;
    message: string;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
  }>({ isOpen: false, type: 'success', message: '' });

  const fetchSurveys = () => {
    setLoading(true);
    const params = new URLSearchParams({
      archive: archiveView,
      page: String(page),
      limit: String(limit),
    });
    if (search.trim()) params.set('search', search.trim());
    fetch(`${API_BASE}/surveys/index.php?${params.toString()}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          // Fetch full details for each survey to get questions
          const surveysWithDetails = res.data.map((survey: Survey) => {
            fetch(`${API_BASE}/surveys/index.php?id=${survey.id}&archive=${archiveView}`, {
              credentials: 'include',
            })
              .then((r) => r.json())
              .then((detailRes) => {
                if (detailRes.success) {
                  const d = detailRes.data;
                  setSurveys((prev) =>
                    prev.map((s) =>
                      s.id === survey.id
                        ? {
                          ...s,
                          questions: (d.questions || []).map((q: Question) => ({
                            ...q,
                            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
                            option_definitions: Array.isArray(q.option_definitions) ? q.option_definitions : [],
                          })),
                        }
                        : s
                    )
                  );
                }
              });
            return survey;
          });
          setSurveys(surveysWithDetails);
          setArchiveCounts(res.archive_counts || { active: 0, archived: 0 });
          setCoverageWarning(
            res.active_survey_coverage?.survey_id && !res.active_survey_coverage?.configured
              ? res.active_survey_coverage?.error || 'Graduation year coverage has not been configured for the active survey.'
              : ''
          );
          const nextPagination = res.pagination || { total: surveysWithDetails.length, page: 1, limit, pages: 1 };
          setPagination(nextPagination);
          if (page > Math.max(1, Number(nextPagination.pages || 1))) {
            setPage(Math.max(1, Number(nextPagination.pages || 1)));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSurveys();
  }, [archiveView, page, limit, search]);

  useEffect(() => {
    fetch(`${API_BASE}/surveys/programs.php`, { credentials: 'include' })
      .then((response) => response.json())
      .then((result) => {
        if (!result.success || !Array.isArray(result.data)) return;
        setMasterPrograms(result.data.map((program: Partial<MasterProgramOption>) => ({
          id: Number(program.id),
          code: String(program.code || '').trim().toUpperCase(),
          name: String(program.name || '').trim(),
        })).filter((program: MasterProgramOption) => program.id > 0 && program.code !== '' && program.name !== ''));
      })
      .catch(() => setMasterPrograms([]));
  }, []);

  const activeSurvey = surveys.find((survey) => survey.status === 'active');
  const createSurveyButtonClass = `flex items-center gap-2 text-white px-6 py-2.5 rounded-lg transition-colors font-semibold shadow-md hover:shadow-lg ${
    activeSurvey ? 'bg-gray-400 hover:bg-gray-500' : 'bg-blue-900 hover:bg-blue-800'
  }`;

  const openAdd = () => {
    if (activeSurvey) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Active Survey Notice',
        message: `"${activeSurvey.title}" is still active. Set the active survey to inactive before creating a new survey.`,
      });
      return;
    }

    setShowTemplates(true);
  };

  const loadGraduateTracerTemplate = () => {
    const defaultProgramLabels = masterPrograms.map((program) => program.name);
    const defaultSurvey: FormData = {
      title: 'Graduate Tracer Study Survey',
      description: 'Comprehensive survey for tracking graduate employment and career outcomes',
      status: 'draft',
      deadline_at: '',
      target_type: 'none',
      total_response_target: '',
      program_targets: {},
      reactivation_reason: '',
      questions: [
        // SECTION 1: PERSONAL INFORMATION
        { question_text: 'Last Name', question_type: 'text', options: null, is_required: 1, sort_order: 1, section: 'Personal Information' },
        { question_text: 'First Name', question_type: 'text', options: null, is_required: 1, sort_order: 2, section: 'Personal Information' },
        { analytics_key: 'middle_name', question_text: 'Middle Initial', question_type: 'text', options: null, is_required: 0, sort_order: 3, section: 'Personal Information' },
        { question_text: 'Name Extension', question_type: 'multiple_choice', options: ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'VI'], is_required: 0, sort_order: 4, section: 'Personal Information' },
        { analytics_key: 'permanent_address', question_text: 'Permanent Address', question_type: 'header', options: null, is_required: 0, sort_order: 5, section: 'Personal Information' },
        { question_text: 'Region', question_type: 'text', options: null, is_required: 1, sort_order: 5, section: 'Personal Information' },
        { question_text: 'Province', question_type: 'text', options: null, is_required: 1, sort_order: 6, section: 'Personal Information' },
        { question_text: 'City/Municipality', question_type: 'text', options: null, is_required: 1, sort_order: 7, section: 'Personal Information' },
        { question_text: 'Barangay', question_type: 'text', options: null, is_required: 1, sort_order: 8, section: 'Personal Information' },
        { question_text: 'Email Address', question_type: 'text', options: null, is_required: 1, sort_order: 9, section: 'Personal Information' },
        { question_text: 'Mobile Number', question_type: 'text', options: null, is_required: 1, sort_order: 10, section: 'Personal Information' },
        { question_text: 'Telephone or Contact Number', question_type: 'text', options: null, is_required: 0, sort_order: 11, section: 'Personal Information' },
        { question_text: 'Civil Status', question_type: 'multiple_choice', options: ['Single', 'Married', 'Separated', 'Single Parent', 'Widowed'], is_required: 1, sort_order: 12, section: 'Personal Information' },
        { question_text: 'Sex', question_type: 'multiple_choice', options: ['Male', 'Female'], is_required: 1, sort_order: 13, section: 'Personal Information' },
        { question_text: 'Birthday', question_type: 'date', options: null, is_required: 1, sort_order: 14, section: 'Personal Information' },
        
        // SECTION 2: EDUCATIONAL BACKGROUND
        { analytics_key: 'program', question_text: 'Degree Program & Specialization', question_type: 'multiple_choice', options: defaultProgramLabels, is_required: 1, sort_order: 13, section: 'Educational Background' },
        {
          question_text: 'Year Graduated',
          question_type: 'multiple_choice',
          options: [],
          is_required: 1,
          sort_order: 14,
          section: 'Educational Background',
        },
        { question_text: 'Honors / Awards Received (if any)', question_type: 'checkbox', options: ['Cum Laude', 'Magna Cum Laude', 'Leadership Award', 'Best in Thesis', 'Dean\'s lister', 'Academic Excellence', 'Other' ], is_required: 0, sort_order: 15, section: 'Educational Background' },
        { question_text: 'Professional Examination(s) Passed (if applicable)', question_type: 'header', options: null, is_required: 0, sort_order: 16, section: 'Educational Background' },
        { question_text: 'Name of Examination', question_type: 'radio', options: ['Licensure Examination for Teachers', 'Civil Service Examination', 'Other:'], is_required: 0, sort_order: 17, section: 'Educational Background' },
        { question_text: 'Date Taken', question_type: 'date', options: null, is_required: 0, sort_order: 18, section: 'Educational Background' },
        { question_text: 'Rating', question_type: 'text', options: null, is_required: 0, sort_order: 19, section: 'Educational Background' },
        { question_text: 'Reason(s) for taking the course / pursuing the degree', question_type: 'checkbox', options: ['High grades in the course/subject area(s) related to the course', 'Good grades in high school', 'Influence of parents/relatives', 'Peer influence', 'Inspired by a role model', 'Strong passion for the profession', 'Prospect for immediate employment', 'Status/prestige of profession', 'Availability of the course in chosen institution', 'Prospect for career advancement', 'Affordable for family', 'Prospect of attractive compensation', 'Opportunity for employment abroad', 'No particular choice / no better idea'], is_required: 1, sort_order: 20, section: 'Educational Background' },
        
        // SECTION 3: TRAININGS ATTENDED AFTER COLLEGE
        { question_text: 'Title of Training', question_type: 'text', options: null, is_required: 0, sort_order: 22, section: 'Trainings Attended After College' },
        { question_text: 'Duration', question_type: 'text', options: null, is_required: 0, sort_order: 23, section: 'Trainings Attended After College' },
        { question_text: 'Name of Training Institution', question_type: 'text', options: null, is_required: 0, sort_order: 24, section: 'Trainings Attended After College' },
        
        // SECTION 4: GRADUATE STUDIES
        { question_text: 'Name of Graduate Program', question_type: 'radio', options: ['Master of Arts in Education', 'Master of Science in Computer Science', 'Master of Science in Hospitality Management', 'Other:'], is_required: 0, sort_order: 25, section: 'Graduate Studies' },
        { question_text: 'Earned Units', question_type: 'text', options: null, is_required: 0, sort_order: 26, section: 'Graduate Studies' },
        { question_text: 'Name of College/University', question_type: 'text', options: null, is_required: 0, sort_order: 27, section: 'Graduate Studies' },
        { question_text: 'What made you pursue advance studies?', question_type: 'radio', options: ['For promotion', 'For professional development', 'Other:'], is_required: 0, sort_order: 28, section: 'Graduate Studies' },
        
        // SECTION 5: EMPLOYMENT DATA
        { question_text: 'Are you presently employed?', question_type: 'multiple_choice', options: ['Yes', 'No'], is_required: 1, sort_order: 29, section: 'Employment Data' },
        { question_text: 'Present Employment Status', question_type: 'multiple_choice', options: ['Regular/Permanent', 'Temporary', 'Casual', 'Contractual', 'Self-employed'], is_required: 0, sort_order: 30, section: 'Employment Data' },
        { question_text: 'If self-employed, what skills acquired in college were you able to apply in your work?', question_type: 'text', options: null, is_required: 0, sort_order: 31, section: 'Employment Data' },
        { question_text: 'Present Occupation (e.g., Grade School Teacher, Engineer, Self-employed)', question_type: 'text', options: null, is_required: 1, sort_order: 32, section: 'Employment Data' },
        { question_text: 'Major line of business of the company you are presently employed in', question_type: 'multiple_choice', options: ['Agriculture, Hunting and Forestry', 'Fishing', 'Mining and Quarrying', 'Manufacturing', 'Electricity, Gas and Water Supply', 'Construction', 'Wholesale and Retail Trade; repair of motor vehicles, motorcycles, and personal household goods', 'Hotel and Restaurants', 'Transport, Storage and Communications', 'Financial Intermediation', 'Real Estate, Renting and Business Activities', 'Public Administration and Defense; Compulsory and Social Security', 'Education', 'Health and Social Work', 'Other Community, Social and Personal Service Activities', 'Private Households and Employed Persons', 'Extra-territorial Organizations and Bodies'], is_required: 1, sort_order: 33, section: 'Employment Data' },
        { question_text: 'Place of work', question_type: 'multiple_choice', options: ['Local', 'Abroad'], is_required: 1, sort_order: 34, section: 'Employment Data' },
        { question_text: 'Is this your first job after college?', question_type: 'multiple_choice', options: ['Yes', 'No (please proceed to Question 37 and 38)'], is_required: 1, sort_order: 35, section: 'Employment Data' },
        { question_text: 'If YES, what are your reason(s) for staying on the job?', question_type: 'checkbox', options: ['Salaries and benefits', 'Career challenge', 'Related to special skill', 'Related to course/program of study', 'Proximity to residence', 'Peer influence', 'Family influence', 'Other:'], is_required: 0, sort_order: 36, section: 'Employment Data' },
        { question_text: 'Is your first job related to the course you took up in college?', question_type: 'multiple_choice', options: ['Yes', 'No'], is_required: 1, sort_order: 37, section: 'Employment Data' },
        { question_text: 'What were your reason(s) for changing job?', question_type: 'checkbox', options: ['Salaries and benefits', 'Career challenge', 'Related to special skills', 'Proximity to residence', 'Other:'], is_required: 0, sort_order: 38, section: 'Employment Data' },
        { question_text: 'How long did you stay in your first job?', question_type: 'multiple_choice', options: ['Less than a month', '1-6 months', '7-11 months', '1 year to less than 2 years', '2 years to less than 3 years', 'More than 3 years'], is_required: 0, sort_order: 39, section: 'Employment Data' },
        { question_text: 'How did you find your first job?', question_type: 'multiple_choice', options: ['Response to job advertisement', 'Walk-in applicant', 'Recommended by someone', 'Information from friends', 'Arranged by school’s job placement officer', 'Family business', 'Job Fair / PESO'], is_required: 0, sort_order: 40, section: 'Employment Data' },
        { question_text: 'How long did it take to land your first job?', question_type: 'multiple_choice', options: ['Less than a month', '1-6 months', '7-11 months', '1 year to less than 2 years', '2 years to less than 3 years', 'More than 3 years'], is_required: 0, sort_order: 41, section: 'Employment Data' },
        { question_text: 'Job Level Position', question_type: 'multiple_choice', options: ['Rank and File', 'Supervisory', 'Managerial', 'Executive'], is_required: 0, sort_order: 42, section: 'Employment Data' },
        { question_text: 'What is your initial gross monthly earning in your first job after college?', question_type: 'multiple_choice', options: ['Below ₱5,000.00', '₱5,000.00 to less than ₱10,000.00', '₱10,000.00 to less than ₱15,000.00 ', '₱15,000.00 to less than ₱20,000.00', '₱20,000.00 to less than ₱25,000.00', '₱25,000 and above'], is_required: 0, sort_order: 43, section: 'Employment Data' },
        { question_text: 'Was the college curriculum relevant to your first job?', question_type: 'multiple_choice', options: ['Yes', 'No'], is_required: 1, sort_order: 44, section: 'Employment Data' },
        { question_text: 'If YES, what competencies were useful?', question_type: 'checkbox', options: ['Communication skills', 'Human relations skills', 'Entrepreneurial skills', 'Information Technology skills', 'Problem-solving skills', 'Critical Thinking skills', 'Other:'], is_required: 0, sort_order: 45, section: 'Employment Data' },
        { question_text: 'Reason(s) why you are not yet employed', question_type: 'checkbox', options: ['Advance or further study', 'Family concern and decided not to find a job', 'Health-related reason(s)', 'Lack of work experience', 'No job opportunity', 'Did not look for a job', 'Other:'], is_required: 0, sort_order: 46, section: 'Employment Data' },
      ]
    };
    setFormData({
      ...defaultSurvey,
      questions: defaultSurvey.questions.map((question, index) => ({
        ...question,
        sort_order: index + 1,
      })),
    });
    setIsEditing(false);
    setShowTemplates(false);
    setShowModal(true);
    // Scroll modal to top after a brief delay
    setTimeout(() => {
      const modalContent = document.querySelector('.fixed.inset-0.z-50 .overflow-y-auto');
      if (modalContent) {
        modalContent.scrollTop = 0;
      }
    }, 100);
  };

  const archiveAllSurveys = () => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Archive all surveys?',
      message: 'The surveys will be removed from the active survey list, but their questions, responses, and historical data will be preserved. Archived surveys can be restored later.',
      confirmText: 'Archive All',
      cancelText: 'Cancel',
      onConfirm: () => {
        fetch(`${API_BASE}/surveys/clear.php`, {
          method: 'POST',
              credentials: 'include',
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) {
              setSurveys([]);
              setMsgBox({ isOpen: true, type: 'success', message: res.message || 'All surveys were archived safely.' });
              fetchSurveys();
            } else {
              setMsgBox({ isOpen: true, type: 'error', message: res.error || 'Unable to archive all surveys.' });
            }
          })
          .catch(() => setMsgBox({ isOpen: true, type: 'error', message: 'Failed to archive surveys' }));
      }
    });
  };

  const loadSurveyEditor = (surveyId: number) => {
    fetch(`${API_BASE}/surveys/index.php?id=${surveyId}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const d = res.data;
          console.log('Editing survey data from server:', d);
          setFormData({
            id: d.id,
            template_id: d.template_id ? Number(d.template_id) : null,
            response_count: Number(d.response_count || 0),
            question_definitions_locked: d.status === 'active' || Number(d.response_count || 0) > 0,
            title: d.title,
            description: d.description || '',
            status: d.status,
            original_status: d.status,
            published_at: d.published_at || null,
            created_at: d.created_at || null,
            deadline_at: toDateTimeLocalValue(d.deadline_at),
            target_type: ['total', 'program'].includes(d.target_type) ? d.target_type : 'none',
            total_response_target: d.total_response_target ? String(d.total_response_target) : '',
            program_targets: Object.fromEntries((d.program_targets || []).map((target: ProgramTargetProgress) => [
              Number(target.program_id), String(target.target),
            ])),
            reactivation_reason: '',
            questions: ensurePermanentAddressSubheader((d.questions || []).map((q: ApiQuestion) => {
              const parsedQuestion: Question = {
                ...q,
                question_type: q.question_type || 'text',
                options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
                option_definitions: Array.isArray(q.option_definitions)
                  ? q.option_definitions.map((option: ApiSurveyOption, optionIndex: number) => ({
                    id: option.id ? Number(option.id) : null,
                    program_id: option.program_id ? Number(option.program_id) : null,
                    key: option.key || option.option_key || null,
                    value: String(option.value ?? option.option_value ?? option.label ?? ''),
                    label: String(option.label ?? option.value ?? ''),
                    sort_order: Number(option.sort_order || optionIndex + 1),
                  }))
                  : [],
              };
              if (isProfessionalExamHeader(parsedQuestion)) {
                parsedQuestion.question_text = getQuestionDisplayText(parsedQuestion);
                parsedQuestion.question_type = 'header';
                parsedQuestion.options = null;
                parsedQuestion.is_required = 0;
              }
              console.log('Parsed question:', parsedQuestion);
              return parsedQuestion;
            })),
          });
          setIsEditing(true);
          setShowModal(true);
        }
      })
      .catch(() => setMsgBox({ isOpen: true, type: 'error', message: 'Unable to open this survey.' }));
  };

  const openEdit = (s: Survey) => {
    loadSurveyEditor(s.id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const conflictingActiveSurvey = surveys.find((survey) => (
      survey.status === 'active'
      && survey.id !== formData.id
      && (!formData.template_id || Number(survey.template_id) !== Number(formData.template_id))
    ));

    if (!isEditing && activeSurvey) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Active Survey Notice',
        message: `"${activeSurvey.title}" is still active. Set the active survey to inactive before creating a new survey.`,
      });
      return;
    }

    if (formData.status === 'active' && conflictingActiveSurvey) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Active Survey Notice',
        message: `"${conflictingActiveSurvey.title}" is already active. Set it to inactive before activating another survey.`,
      });
      return;
    }

    if (formData.status === 'active' && !formData.deadline_at) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Deadline Required',
        message: 'Set a survey end date and time before activating this survey.',
      });
      return;
    }

    const deadline = manilaDate(formData.deadline_at);
    if (formData.deadline_at && !deadline) {
      setMsgBox({ isOpen: true, type: 'error', message: 'Enter a valid survey deadline.' });
      return;
    }
    const surveyStart = manilaDate(formData.published_at || formData.created_at);
    if (deadline && surveyStart && deadline <= surveyStart) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Invalid Deadline',
        message: 'The deadline must be later than the survey start time in Philippine time.',
      });
      return;
    }
    if (formData.status === 'active' && deadline && deadline <= new Date()) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Extend the Deadline',
        message: 'An active survey needs a future deadline in Philippine time.',
      });
      return;
    }

    if (formData.target_type === 'total' && !/^[1-9]\d*$/.test(formData.total_response_target)) {
      setMsgBox({ isOpen: true, type: 'error', message: 'Total response target must be a positive whole number.' });
      return;
    }
    const configuredProgramTargets = masterPrograms
      .map((program) => ({
        program_id: program.id,
        target: formData.program_targets[program.id]?.trim() || '',
      }))
      .filter((target) => target.target !== '');
    if (
      formData.target_type === 'program'
      && (
        configuredProgramTargets.length === 0
        || configuredProgramTargets.some((target) => !/^[1-9]\d*$/.test(target.target))
      )
    ) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Configure at least one program target using positive whole numbers.',
      });
      return;
    }
    const isManualReactivation = isEditing
      && formData.original_status === 'completed'
      && formData.status === 'active';
    if (isManualReactivation && !formData.reactivation_reason.trim()) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Reactivation Reason Required',
        message: 'Enter a reason for reopening this completed survey.',
      });
      return;
    }

    const yearQuestionIndexes = formData.questions
      .map((question, index) => isGraduationYearQuestion(question.question_text) ? index : -1)
      .filter((index) => index >= 0);
    const coverageErrors: string[] = [];
    if (yearQuestionIndexes.length > 1) {
      coverageErrors.push('Only one Year Graduated question can define survey coverage.');
    }
    if (formData.status === 'active' && yearQuestionIndexes.length === 0) {
      coverageErrors.push('Add a Year Graduated multiple-choice question before activating this survey.');
    }

    const normalizedQuestions = formData.questions.map((question, index) => {
      if (!yearQuestionIndexes.includes(index)) return question;
      if (question.question_type !== 'multiple_choice') {
        coverageErrors.push('Year Graduated must use the Multiple Choice question type.');
      }
      const stableYearOptions = (question.option_definitions || [])
        .map((option) => option.value)
        .filter((value) => value.trim() !== '');
      const analysis = analyzeGraduationYearOptions(stableYearOptions.length > 0 ? stableYearOptions : (question.options || []));
      coverageErrors.push(...analysis.errors);
      return stableYearOptions.length > 0 ? question : { ...question, options: analysis.years };
    });

    if (coverageErrors.length > 0) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Invalid Year Graduated Coverage',
        message: Array.from(new Set(coverageErrors)).join('\n'),
      });
      return;
    }

    const saveSurvey = () => {
      const method = isEditing ? 'PUT' : 'POST';
      fetch(`${API_BASE}/surveys/index.php`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          deadline_at: formData.deadline_at || null,
          total_response_target: formData.target_type === 'total'
            ? Number(formData.total_response_target)
            : null,
          program_targets: formData.target_type === 'program'
            ? configuredProgramTargets.map((target) => ({ ...target, target: Number(target.target) }))
            : [],
          questions: normalizedQuestions,
        }),
      })
        .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
        .then(({ ok, body: res }) => {
          if (ok && res.success) {
            setShowModal(false);
            fetchSurveys();
            setMsgBox({ isOpen: true, type: 'success', message: res.message || 'Survey updated.' });
          } else if (res.active_survey) {
            setMsgBox({
              isOpen: true,
              type: 'warning',
              title: 'Active Survey Notice',
              message: res.error || 'Set the active survey to inactive before continuing.',
            });
          } else {
            setMsgBox({ isOpen: true, type: 'error', message: res.error || 'Unable to save survey' });
          }
        })
        .catch(() => setMsgBox({ isOpen: true, type: 'error', message: 'Unable to save survey.' }));
    };

    if (isManualReactivation) {
      setMsgBox({
        isOpen: true,
        type: 'confirm',
        title: 'Reactivate Completed Survey?',
        message: 'Reactivation will allow eligible graduates to answer again. Existing responses and analytics will be preserved. A passed deadline must be extended first; an already-reached target will be deliberately suppressed until the target configuration changes.',
        confirmText: 'Reactivate Survey',
        cancelText: 'Cancel',
        onConfirm: saveSurvey,
      });
      return;
    }

    if (isEditing && formData.question_definitions_locked) {
      setMsgBox({
        isOpen: true,
        type: 'confirm',
        title: 'Save survey changes?',
        message: 'This will update the survey wording and Degree Program & Specialization options. Existing response values and statistics will remain unchanged.',
        confirmText: 'Save Changes',
        cancelText: 'Cancel',
        onConfirm: saveSurvey,
      });
      return;
    }

    saveSurvey();
  };

  const handleArchive = (id: number) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Archive Survey?',
      message: 'This survey will no longer be available as an active survey. Existing questions, responses, timestamps, and analytics history will be preserved.',
      confirmText: 'Archive',
      cancelText: 'Cancel',
      onConfirm: () => {
        fetch(`${API_BASE}/surveys/index.php`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) {
              setSurveys((current) => current.filter((survey) => survey.id !== id));
              fetchSurveys();
              setMsgBox({ isOpen: true, type: 'success', message: res.message || 'Survey archived successfully.' });
            } else {
              setMsgBox({ isOpen: true, type: 'error', message: res.error || 'Unable to archive survey.' });
            }
          })
          .catch(() => setMsgBox({ isOpen: true, type: 'error', message: 'Unable to archive survey.' }));
      }
    });
  };

  const handleRestore = (survey: Survey) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Restore Survey?',
      message: 'This survey will return to Survey Management. The same survey, questions, choices, responses, and analytics history will be restored without duplication.',
      confirmText: 'Restore',
      cancelText: 'Cancel',
      onConfirm: () => {
        fetch(`${API_BASE}/surveys/index.php`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: survey.id, action: 'restore' }),
        })
          .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
          .then(({ ok, body }) => {
            if (!ok || !body.success) throw new Error(body.error || 'Unable to restore survey');
            setSurveys((current) => current.filter((item) => item.id !== survey.id));
            fetchSurveys();
            setMsgBox({ isOpen: true, type: 'success', message: body.message || 'Survey restored successfully.' });
          })
          .catch((error) => setMsgBox({
            isOpen: true,
            type: 'error',
            message: error instanceof Error ? error.message : 'Unable to restore survey.',
          }));
      },
    });
  };

  const handlePermanentDelete = (survey: Survey) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Permanently Delete Survey?',
      message: `Permanently delete "${survey.title}"? Its questions, responses, reminder history, and analytics source data will be deleted. This cannot be undone.`,
      confirmText: 'Permanently Delete',
      cancelText: 'Cancel',
      destructive: true,
      onConfirm: () => {
        fetch(`${API_BASE}/surveys/index.php`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: survey.id, action: 'permanent_delete' }),
        })
          .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
          .then(({ ok, body }) => {
            if (!ok || !body.success) throw new Error(body.error || 'Unable to permanently delete survey');
            setSurveys((current) => current.filter((item) => item.id !== survey.id));
            if (surveys.length === 1 && page > 1) setPage((current) => Math.max(1, current - 1));
            else fetchSurveys();
            setMsgBox({ isOpen: true, type: 'success', message: body.message || 'Survey permanently deleted.' });
          })
          .catch((error) => setMsgBox({
            isOpen: true,
            type: 'error',
            message: error instanceof Error ? error.message : 'Unable to permanently delete survey.',
          }));
      },
    });
  };

  const updateQuestion = (index: number, field: keyof Question, value: string | string[] | number | null) => {
    setFormData((prev) => {
      const questions = [...prev.questions];
      questions[index] = { ...questions[index], [field]: value };
      return { ...prev, questions };
    });
  };

  const updateQuestionSection = (index: number, value: string) => {
    setFormData((prev) => {
      const source = prev.questions[index];
      const questions = prev.questions.map((question, questionIndex) => {
        const sameProtectedSection = Boolean(prev.question_definitions_locked)
          && Boolean(source.id)
          && Number(source.section_id || 0) > 0
          && Number(question.section_id || 0) === Number(source.section_id || 0);
        return questionIndex === index || sameProtectedSection ? { ...question, section: value } : question;
      });
      return { ...prev, questions };
    });
  };

  const addQuestion = () => {
    setFormData((prev) => {
      const questions = [...prev.questions, {
        question_text: '',
        question_type: 'text',
        options: null,
        is_required: 0,
        sort_order: prev.questions.length + 1,
        section: prev.questions[prev.questions.length - 1]?.section || '',
      }];
      setExpandedQ(questions.length - 1);
      return { ...prev, questions };
    });
  };

  const addSubheader = () => {
    setFormData((prev) => {
      const questions = [...prev.questions, {
        question_text: '',
        question_type: 'header',
        options: null,
        is_required: 0,
        sort_order: prev.questions.length + 1,
        section: prev.questions[prev.questions.length - 1]?.section || '',
      }];
      setExpandedQ(questions.length - 1);
      return { ...prev, questions };
    });
  };

  const removeQuestion = (index: number) => {
    const question = formData.questions[index];
    const preservesHistoricalAnswers = Boolean(question.id) && Number(formData.response_count || 0) > 0;
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Remove Question?',
      message: preservesHistoricalAnswers
        ? `Remove "${question.question_text || 'this question'}" from future survey forms? Its existing answers and historical record will be preserved.`
        : `Remove "${question.question_text || 'this untitled question'}" from this survey?`,
      confirmText: 'Remove Question',
      cancelText: 'Cancel',
      destructive: true,
      onConfirm: () => {
        setFormData((prev) => ({
          ...prev,
          questions: prev.questions
            .filter((_, questionIndex) => questionIndex !== index)
            .map((item, questionIndex) => ({ ...item, sort_order: questionIndex + 1 })),
        }));
        setExpandedQ(null);
      },
    });
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= formData.questions.length) return;
    setFormData((prev) => {
      const questions = [...prev.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return {
        ...prev,
        questions: questions.map((question, questionIndex) => ({
          ...question,
          sort_order: questionIndex + 1,
        })),
      };
    });
    setExpandedQ(target);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    setFormData((prev) => {
      const questions = [...prev.questions];
      const options = [...(questions[questionIndex].options || [])];
      options[optionIndex] = value;
      const definitions = [...(questions[questionIndex].option_definitions || [])];
      if (definitions[optionIndex]) {
        definitions[optionIndex] = {
          ...definitions[optionIndex],
          value: definitions[optionIndex].id ? definitions[optionIndex].value : value,
          label: value,
        };
      }
      questions[questionIndex] = { ...questions[questionIndex], options, option_definitions: definitions };
      return { ...prev, questions };
    });
  };

  const addOption = (questionIndex: number) => {
    setFormData((prev) => {
      const questions = [...prev.questions];
      const question = questions[questionIndex];
      const options = [...(question.options || []), ''];
      const definitions = [...(question.option_definitions || []), {
        id: null,
        key: null,
        value: '',
        label: '',
        sort_order: options.length,
      }];
      questions[questionIndex] = { ...question, options, option_definitions: definitions };
      return { ...prev, questions };
    });
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    setFormData((prev) => {
      const questions = [...prev.questions];
      const question = questions[questionIndex];
      const options = (question.options || []).filter((_, index) => index !== optionIndex);
      const definitions = (question.option_definitions || [])
        .filter((_, index) => index !== optionIndex)
        .map((definition, index) => ({ ...definition, sort_order: index + 1 }));
      questions[questionIndex] = { ...question, options, option_definitions: definitions };
      return { ...prev, questions };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-900 sm:text-3xl">{archiveView === 'archived' ? 'Survey Archive' : 'Survey Management'}</h1>
          <p className="text-sm text-gray-500 mt-1">{pagination.total} {archiveView === 'archived' ? 'archived' : 'active'} survey{pagination.total === 1 ? '' : 's'}</p>
          {archiveView === 'active' && activeSurvey && (
            <p className="text-xs text-amber-700 mt-1">
              Set "{activeSurvey.title}" to inactive before creating another survey.
            </p>
          )}
        </div>
        <div className="flex w-full gap-3 sm:w-auto">
          {archiveView === 'active' && <button onClick={openAdd} className={`${createSurveyButtonClass} w-full justify-center sm:w-auto`} title={activeSurvey ? 'Inactive the active survey first' : 'Create Survey'}>
            <Plus className="w-5 h-5" /> Create Survey
          </button>}
        </div>
      </div>

      {coverageWarning && archiveView === 'active' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Active survey configuration:</span> {coverageWarning}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Survey sections" className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setArchiveView('active'); setRouteSearchParams({}); setPage(1); }}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${archiveView === 'active' ? 'border-blue-700 bg-blue-700 text-white' : 'bg-white text-gray-700'}`}
          >
            Survey Management
            <span className={`rounded-full px-2 py-0.5 text-xs ${archiveView === 'active' ? 'bg-white/15' : 'bg-gray-100'}`}>{archiveCounts.active}</span>
          </button>
          <button
            type="button"
            onClick={() => { setArchiveView('archived'); setRouteSearchParams({ archive: 'archived' }); setExpandedSurvey(null); setPage(1); }}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${archiveView === 'archived' ? 'border-blue-700 bg-blue-700 text-white' : 'bg-white text-gray-700'}`}
          >
            <Archive className="h-4 w-4" /> Archive
            <span className={`rounded-full px-2 py-0.5 text-xs ${archiveView === 'archived' ? 'bg-white/15' : 'bg-gray-100'}`}>{archiveCounts.archived}</span>
          </button>
        </nav>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search survey title"
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Survey Cards */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
        </div>
      ) : surveys.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center sm:p-12">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">{archiveView === 'archived' ? 'No archived surveys.' : 'No surveys yet'}</p>
          <p className="text-gray-500 text-sm mb-6">{archiveView === 'archived' ? 'Archived surveys will appear here and can be restored or permanently deleted.' : 'Create your first survey using the Graduate Tracer Study template'}</p>
          {archiveView === 'active' && <button onClick={openAdd} className={`${createSurveyButtonClass} mx-auto`}>
            <Plus className="w-5 h-5" /> Create Survey
          </button>}
        </div>
      ) : (
        <>
          {archiveView === 'active' && <div className="flex justify-end mb-4">
            <button onClick={archiveAllSurveys} className="flex w-full items-center justify-center gap-2 border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 sm:w-auto">
              <Archive className="w-4 h-4" /> Archive All Surveys
            </button>
          </div>}
          <div className="grid gap-4">
          {surveys.map((s) => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow hover:border-yellow-200 overflow-hidden">
              <div className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-blue-900 sm:text-xl">{s.title}</h3>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${archiveView === 'archived' ? 'bg-amber-100 text-amber-700' : statusStyle[s.status] || 'bg-gray-100'}`}>
                        {archiveView === 'archived' ? 'Archived' : s.status}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-4">{s.description}</p>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 sm:gap-6">
                      <span className="flex items-center gap-1"><ClipboardList className="w-4 h-4" /> {getAnswerableQuestionCount(s.questions, s.question_count)} questions</span>
                      <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> {s.response_count} responses</span>
                      <span>Created: {new Date(s.created_at).toLocaleDateString()}</span>
                      {s.deadline_at && (
                        <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" /> Deadline: {formatManilaDateTime(s.deadline_at)}</span>
                      )}
                      {archiveView === 'archived' && <span>Archived: {s.archived_at ? new Date(s.archived_at.replace(' ', 'T')).toLocaleDateString() : '-'}</span>}
                      {archiveView === 'archived' && <span>Archived by: {s.archived_by_name || '-'}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                    <button onClick={() => navigate(`/admin/surveys/${s.id}${archiveView === 'archived' ? '?archive=archived' : ''}`)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors font-medium" title="View Details">
                      <Info className="w-5 h-5" />
                    </button>
                    {archiveView === 'active' ? <>
                       <button onClick={() => navigate(`/admin/surveys/${s.id}/analytics`)} className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors font-medium" title="View responses">
                         <BarChart3 className="w-5 h-5" />
                       </button>
                      <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-yellow-50 text-yellow-600 transition-colors font-medium" title="Edit survey">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleArchive(s.id)} className="p-2 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors font-medium" title="Archive">
                        <Archive className="w-5 h-5" />
                      </button>
                    </> : (
                      <>
                        <button onClick={() => handleRestore(s)} className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors font-medium" title="Restore">
                          <RotateCcw className="w-5 h-5" />
                        </button>
                        <button onClick={() => handlePermanentDelete(s)} className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors font-medium" title="Delete permanently">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {s.target_progress && s.target_progress.target_type !== 'none' && (
                  <div className="mt-4 rounded-xl border border-border bg-surface-alt p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div>
                        <span className="font-semibold text-text-primary">
                          {s.target_progress.target_type === 'program' ? 'Program target progress' : 'Total target progress'}
                        </span>
                        <span className="ml-2 text-text-secondary">
                          {s.target_progress.target_progress_count ?? s.target_progress.valid_responses} / {s.target_progress.configured_target}
                        </span>
                      </div>
                      <span className="font-semibold text-blue-800 dark:text-blue-200">
                        {s.target_progress.progress_percent ?? 0}% · {s.target_progress.remaining ?? 0} remaining
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.target_progress.progress_percent ?? 0}>
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${s.target_progress.progress_percent ?? 0}%` }} />
                    </div>
                    {s.target_progress.target_completion_suppressed && s.status === 'active' && (
                      <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Target auto-completion is paused because this survey was intentionally reactivated. Changing the target resets this override.</p>
                    )}
                    {s.target_progress.target_type === 'program' && s.target_progress.programs.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {s.target_progress.programs.map((program) => (
                          <div key={program.program_id} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-text-primary">{program.program_code}</span>
                              <span className={program.reached ? 'font-semibold text-emerald-600 dark:text-emerald-300' : 'text-text-secondary'}>{program.submitted} / {program.target}</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                              <div className={`h-full rounded-full ${program.reached ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${program.progress_percent}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {s.status === 'completed' && s.completion_message && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100">
                    {s.completion_message}
                  </div>
                )}

                {/* Questions Preview Section */}
                {s.questions && s.questions.length > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <button
                      onClick={() => setExpandedSurvey(expandedSurvey === s.id ? null : s.id)}
                      className="w-full flex items-center justify-between rounded bg-surface-alt p-2 text-left text-text-primary transition hover:bg-surface-hover"
                    >
                      <h4 className="font-semibold text-text-primary">Preview Questions</h4>
                      {expandedSurvey === s.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      )}
                    </button>

                    {expandedSurvey === s.id && (
                      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border bg-surface-alt p-4">
                        {s.questions.map((q, idx) => {
                          const isHeader = isHeaderQuestion(q);

                          return (
                            <div key={idx} className="rounded-lg border border-border bg-surface p-3 text-text-primary">
                              <p className="mb-2 text-sm font-semibold text-text-primary">
                                {isHeader ? 'Header: ' : `Q${getDisplayQuestionNumber(s.questions || [], idx)}: `}{getQuestionDisplayText(q)}
                                {!isHeader && q.is_required ? <span className="text-red-500 ml-1">*</span> : null}
                              </p>
                              <p className="mb-2 text-xs capitalize text-text-muted">{isHeader ? 'Header' : q.question_type.replace('_', ' ')}</p>
                              {!isHeader && q.options && Array.isArray(q.options) && q.options.length > 0 && (
                                <div className="space-y-1 ml-2">
                                  {q.options.map((option, oi) => (
                                    <div key={oi} className="flex items-center gap-2 text-xs text-text-secondary">
                                      <div className="w-3 h-3 rounded-full border border-blue-600 flex-shrink-0" />
                                      {option}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {pagination.pages > 1 && (
        <div className="flex flex-col gap-3 rounded-xl border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500" htmlFor="survey-page-size">Rows</label>
            <select
              id="survey-page-size"
              value={limit}
              onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}
              className="rounded-lg border px-2 py-1.5 text-sm"
            >
              {[5, 10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg border p-2 hover:bg-gray-50 disabled:opacity-40" aria-label="Previous survey page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))} disabled={page >= pagination.pages} className="rounded-lg border p-2 hover:bg-gray-50 disabled:opacity-40" aria-label="Next survey page">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Template Selection Modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 p-4 border-b sticky top-0 bg-white rounded-t-2xl z-10 sm:p-6">
              <div>
                <h2 className="text-xl font-bold text-blue-900 sm:text-2xl">Choose Survey Template</h2>
                <p className="text-sm text-gray-500 mt-1">Select the Graduate Tracer Study template</p>
              </div>
              <button onClick={() => setShowTemplates(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 space-y-4 sm:p-6">
              <button
                type="button"
                onClick={loadGraduateTracerTemplate}
                className="w-full text-left border-2 border-gray-200 rounded-xl p-5 hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg group-hover:from-blue-200 group-hover:to-blue-100 transition">
                    <Briefcase className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-base font-bold text-blue-900 group-hover:text-blue-700">
                        Graduate Tracer Study Survey
                      </h3>
                      <span title="Analytics Enabled">
                        <BarChart3 className="w-4 h-4 text-green-600" />
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Comprehensive survey for tracking graduate employment and career outcomes
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                        Employment
                      </span>
                      <span>44 questions</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="survey-editor-modal flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface text-text-primary shadow-2xl">
            <div className="flex flex-shrink-0 items-center justify-between gap-4 rounded-t-2xl border-b border-border bg-surface p-4 sm:p-6">
              <h2 className="text-xl font-bold text-text-primary sm:text-2xl">
                {isEditing ? 'Edit Survey' : 'Create New Survey'}
              </h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto">
              <datalist id="survey-program-master-options">
                {masterPrograms.map((program) => (
                  <option key={program.id} value={program.name}>{program.code}</option>
                ))}
              </datalist>
              <div className="p-4 space-y-6 sm:p-6">
                <section className="space-y-4" aria-labelledby="survey-information-heading">
                  <div>
                    <h3 id="survey-information-heading" className="text-lg font-bold text-blue-900 dark:text-blue-200">Survey Information</h3>
                    <p className="mt-1 text-xs text-text-secondary">All dates and deadline checks use Philippine time (Asia/Manila).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">Survey Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                      placeholder="Enter survey title"
                      className="w-full rounded-lg border-2 border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      placeholder="Describe the purpose of this survey"
                      className="w-full resize-none rounded-lg border-2 border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full rounded-lg border-2 border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {isEditing && (formData.published_at || formData.created_at) && (
                      <div>
                        <label className="mb-2 block text-sm font-bold text-blue-900 dark:text-blue-200">Survey Start</label>
                        <div className="rounded-lg border-2 border-border bg-surface-alt px-4 py-2.5 text-sm text-text-secondary">
                          {formatManilaDateTime(formData.published_at || formData.created_at)}
                        </div>
                      </div>
                    )}
                    <div className={isEditing && (formData.published_at || formData.created_at) ? '' : 'sm:col-span-2'}>
                      <label className="mb-2 block text-sm font-bold text-blue-900 dark:text-blue-200">
                        Survey End Date / Deadline {formData.status === 'active' && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.deadline_at}
                        min={formData.status === 'completed' ? undefined : getManilaDateTimeLocalNow()}
                        required={formData.status === 'active'}
                        onChange={(event) => setFormData({ ...formData, deadline_at: event.target.value })}
                        className="w-full rounded-lg border-2 border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-xs text-text-secondary">Graduates cannot verify or submit at or after this Philippine date and time.</p>
                    </div>
                  </div>
                  {formData.original_status === 'completed' && formData.status === 'active' && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-400/40 dark:bg-amber-400/10">
                      <label className="mb-2 block text-sm font-bold text-amber-900 dark:text-amber-200">Reason for Reactivation <span className="text-red-500">*</span></label>
                      <textarea
                        value={formData.reactivation_reason}
                        maxLength={500}
                        rows={2}
                        onChange={(event) => setFormData({ ...formData, reactivation_reason: event.target.value })}
                        placeholder="Explain why eligible graduates should be allowed to answer again"
                        className="w-full resize-none rounded-lg border border-amber-300 bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}
                </section>

                <section className="space-y-4 border-t border-border pt-6" aria-labelledby="respondent-targets-heading">
                  <div>
                    <h3 id="respondent-targets-heading" className="flex items-center gap-2 text-lg font-bold text-blue-900 dark:text-blue-200">
                      <Target className="h-5 w-5" /> Respondent Targets
                    </h3>
                    <p className="mt-1 text-xs text-text-secondary">Targets are optional. Counts use unique, successfully submitted responses and each graduate's official program record.</p>
                  </div>
                  <div>
                    <label htmlFor="survey-target-type" className="mb-2 block text-sm font-bold text-blue-900 dark:text-blue-200">Target Type</label>
                    <select
                      id="survey-target-type"
                      value={formData.target_type}
                      onChange={(event) => setFormData({ ...formData, target_type: event.target.value as TargetType })}
                      className="w-full rounded-lg border-2 border-border bg-surface px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="none">No Target</option>
                      <option value="total">Total Target</option>
                      <option value="program">Per Program</option>
                    </select>
                  </div>
                  {formData.target_type === 'total' && (
                    <div>
                      <label htmlFor="survey-total-target" className="mb-2 block text-sm font-bold text-blue-900 dark:text-blue-200">Total Graduate Target</label>
                      <input
                        id="survey-total-target"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={formData.total_response_target}
                        onChange={(event) => setFormData({ ...formData, total_response_target: event.target.value })}
                        placeholder="e.g. 200"
                        className="w-full rounded-lg border-2 border-border bg-surface px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  {formData.target_type === 'program' && (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {masterPrograms.map((program) => (
                          <label key={program.id} className="rounded-lg border border-border bg-surface-alt p-3">
                            <span className="block text-sm font-semibold text-text-primary">{program.code}</span>
                            <span className="mb-2 block truncate text-xs text-text-secondary" title={program.name}>{program.name}</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={formData.program_targets[program.id] || ''}
                              onChange={(event) => setFormData({
                                ...formData,
                                program_targets: { ...formData.program_targets, [program.id]: event.target.value },
                              })}
                              placeholder="No target"
                              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 text-sm dark:bg-blue-400/10">
                        <span className="font-semibold text-blue-900 dark:text-blue-200">Overall configured target</span>
                        <span className="text-lg font-bold text-blue-900 dark:text-blue-200">
                          {Object.values(formData.program_targets).reduce((sum, target) => sum + (/^[1-9]\d*$/.test(target) ? Number(target) : 0), 0)}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">Leave a program blank when it should not have a target. Every configured program must reach its own target before automatic completion.</p>
                    </div>
                  )}
                </section>

                {/* Questions */}
                <div className="border-t pt-6">
                  <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-bold text-blue-900">Questions ({getAnswerableQuestionCount(formData.questions)})</h3>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={addSubheader}
                        title="Add a display-only subheader"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-900 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                      >
                        <Plus className="h-4 w-4" /> Add Subheader
                      </button>
                      <button
                        type="button"
                        onClick={addQuestion}
                        disabled={Boolean(formData.question_definitions_locked)}
                        title={formData.question_definitions_locked ? 'Adding questions is locked to protect existing response mappings.' : 'Add question'}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        <Plus className="h-4 w-4" /> Add Question
                      </button>
                    </div>
                  </div>

                  {/* Editing safety / section helper */}
                  {isEditing && formData.question_definitions_locked ? (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <p className="mb-2 text-sm font-semibold text-amber-900">Existing answers are protected</p>
                       <p className="text-xs text-amber-800">This survey already has responses or is active. Structural changes remain locked, except the Degree Program & Specialization options that define current verification eligibility. Historical responses remain preserved.</p>
                    </div>
                  ) : (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900 font-semibold mb-2">Tip: Group questions by section</p>
                      <p className="text-xs text-blue-700">Enter the same section name (e.g., "Personal Information") for related questions. Use Add Subheader for labels inside a section, such as "Permanent Address".</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {formData.questions.map((q, i) => {
                      const prevSection = i > 0 ? formData.questions[i - 1].section : null;
                      const showSectionBadge = q.section && q.section !== prevSection;
                      const isHeader = isHeaderQuestion(q);
                      const questionDefinitionLocked = Boolean(q.id) && Boolean(formData.question_definitions_locked);
                      const isProgramScopeQuestion = q.analytics_key === 'program';
                      
                      return (
                        <div key={i}>
                          {/* Section Badge */}
                          {showSectionBadge && (
                            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg mb-2 font-bold text-sm uppercase tracking-wide">
                              📋 {q.section}
                            </div>
                          )}
                          
                          {/* Question Card */}
                          <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                            <div
                              className="flex items-center justify-between p-4 bg-blue-50 cursor-pointer hover:bg-blue-100 transition"
                              onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                            >
                              <div className="flex-1">
                                <span className="text-sm font-semibold text-blue-900">
                                  {isHeader ? 'Subheader: ' : `Q${getDisplayQuestionNumber(formData.questions, i)}: `}{q.question_text ? getQuestionDisplayText(q) : '(untitled)'}
                                </span>
                                {q.section && (
                                  <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded-full">
                                    {q.section}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); moveQuestion(i, -1); }}
                                 disabled={i === 0 || (Boolean(formData.question_definitions_locked) && !isHeader)}
                                  className="rounded-md p-1.5 text-blue-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                                  aria-label="Move question up"
                                  title="Move up"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); moveQuestion(i, 1); }}
                                 disabled={i === formData.questions.length - 1 || (Boolean(formData.question_definitions_locked) && !isHeader)}
                                  className="rounded-md p-1.5 text-blue-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                                  aria-label="Move question down"
                                  title="Move down"
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); removeQuestion(i); }}
                                 disabled={Boolean(formData.question_definitions_locked) && !isHeader}
                                 className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                  aria-label="Delete question"
                                  title="Delete question"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                                {expandedQ === i ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                              </div>
                            </div>

                            {expandedQ === i && (
                              <fieldset className="p-4 space-y-4 bg-gray-50">
                                {questionDefinitionLocked && (
                                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    {isProgramScopeQuestion
                                      ? 'Type and required settings remain locked. These Degree Program & Specialization options define the programs allowed on Verify Identity and may still be added, edited, or removed.'
                                      : 'Text fields remain editable. Type, required setting, IDs, option values, ordering, additions, and deletions are locked.'}
                                  </p>
                                )}
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Section <span className="text-xs text-gray-500">(Group related questions together)</span>
                                  </label>
                                  <select
                                    value={q.section || ''}
                                    onChange={(e) => updateQuestionSection(i, e.target.value)}
                                    className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white mb-2"
                                  >
                                    <option value="">-- No Section --</option>
                                    <option value="Personal Information">Personal Information</option>
                                    <option value="Educational Background">Educational Background</option>
                                    <option value="Trainings Attended After College">Trainings Attended After College</option>
                                    <option value="Graduate Studies">Graduate Studies</option>
                                    <option value="Employment Data">Employment Data</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={q.section || ''}
                                    onChange={(e) => updateQuestionSection(i, e.target.value)}
                                    placeholder="Or type a custom section name"
                                    className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">{isHeader ? 'Subheader Text' : 'Question Text'}</label>
                                  <input
                                    type="text"
                                    value={q.question_text}
                                    onChange={(e) => updateQuestion(i, 'question_text', e.target.value)}
                                    placeholder={isHeader ? 'Enter your subheader' : 'Enter your question'}
                                    className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                                    <select
                                      value={q.question_type || 'text'}
                                     disabled={questionDefinitionLocked || (Boolean(formData.question_definitions_locked) && !q.id)}
                                     title={questionDefinitionLocked || (Boolean(formData.question_definitions_locked) && !q.id) ? 'Question type is locked to protect existing responses.' : undefined}
                                      onChange={(e) => {
                                        const newType = e.target.value;
                                        updateQuestion(i, 'question_type', newType);
                                        if (newType === 'header') {
                                          updateQuestion(i, 'options', null);
                                          updateQuestion(i, 'is_required', 0);
                                          return;
                                        }
                                        // Clear options if switching to text or date type
                                        if (newType === 'text' || newType === 'date') {
                                          updateQuestion(i, 'options', null);
                                        } else if (!q.options) {
                                          // Initialize empty options array for choice-based types
                                          updateQuestion(i, 'options', []);
                                        }
                                      }}
                                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                                    >
                                      <option value="header">Subheader (display only)</option>
                                      <option value="text">Text</option>
                                      <option value="date">Date</option>
                                      <option value="multiple_choice">Multiple Choice</option>
                                      <option value="radio">Radio Button</option>
                                      <option value="rating">Rating</option>
                                      <option value="checkbox">Checkbox</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Required</label>
                                    {isHeader ? (
                                      <div className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-500">
                                        No, subheaders are display only
                                      </div>
                                    ) : (
                                      <select
                                        value={q.is_required}
                                       disabled={questionDefinitionLocked}
                                       title={questionDefinitionLocked ? 'Required/optional status is locked to protect existing responses.' : undefined}
                                        onChange={(e) => updateQuestion(i, 'is_required', parseInt(e.target.value))}
                                        className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
                                      >
                                        <option value={1}>Yes</option>
                                        <option value={0}>No</option>
                                      </select>
                                    )}
                                  </div>
                                </div>
                                {!isHeader && (q.question_type === 'multiple_choice' || q.question_type === 'radio' || q.question_type === 'checkbox') && (
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                      {isGraduationYearQuestion(q.question_text)
                                        ? 'Options (official survey graduation-year coverage)'
                                        : 'Options (one per line)'}
                                    </label>
                                    <div className="space-y-2">
                                      {(q.options || []).map((option, optionIndex) => (
                                        <div key={optionIndex} className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            list={isProgramScopeQuestion ? 'survey-program-master-options' : undefined}
                                            value={option}
                                            onChange={(event) => updateOption(i, optionIndex, event.target.value)}
                                            placeholder={`Option ${optionIndex + 1}`}
                                            className="min-w-0 flex-1 rounded-lg border-2 border-gray-300 px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => removeOption(i, optionIndex)}
                                           disabled={questionDefinitionLocked && !isProgramScopeQuestion}
                                           className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                            aria-label={`Remove option ${optionIndex + 1}`}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      ))}
                                      <button
                                        type="button"
                                        onClick={() => addOption(i)}
                                       disabled={questionDefinitionLocked && !isProgramScopeQuestion}
                                       title={questionDefinitionLocked && !isProgramScopeQuestion ? 'Adding options is locked because submitted responses depend on stable option values.' : undefined}
                                       className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                                      >
                                        <Plus className="h-4 w-4" /> Add Option
                                      </button>
                                    </div>
                                    {isGraduationYearQuestion(q.question_text) && (
                                      <p className="mt-2 text-xs text-gray-500">
                                        Enter one four-digit year per line. These exact years control survey eligibility, monitoring, filters, and reminders.
                                      </p>
                                    )}
                                    {isProgramScopeQuestion && (
                                      <p className="mt-2 text-xs text-blue-700">
                                        These saved options are the only programs shown on Verify Identity. Each option must match a program in the registrar master list.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </fieldset>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-shrink-0 flex-wrap justify-end gap-3 border-t border-border bg-surface-alt p-4 sm:p-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg font-semibold transition shadow-md hover:shadow-lg">
                  {isEditing ? 'Update Survey' : 'Create Survey'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
        cancelText={msgBox.cancelText}
        destructive={msgBox.destructive}
      />
    </div>
  );
}
