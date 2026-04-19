import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, X, ClipboardList, ChevronDown, ChevronUp, ShieldCheck, BarChart3, Briefcase, Info,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MessageBox from '../../components/MessageBox';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;

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
  question_count: number;
  response_count: number;
  created_at: string;
  questions?: Question[];
}

interface FormData {
  id?: number;
  title: string;
  description: string;
  status: string;
  questions: Question[];
}

const emptyForm: FormData = {
  title: '', description: '', status: 'draft', questions: [],
};

const statusStyle: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  draft: 'bg-yellow-100 text-yellow-700',
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

export default function Surveys() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [expandedSurvey, setExpandedSurvey] = useState<number | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const navigate = useNavigate();
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'confirm' | 'success' | 'error' | 'warning';
    title?: string;
    message: string;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({ isOpen: false, type: 'success', message: '' });

  const fetchSurveys = () => {
    setLoading(true);
    fetch(`${API_BASE}/surveys/index.php`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          // Fetch full details for each survey to get questions
          const surveysWithDetails = res.data.map((survey: Survey) => {
            fetch(`${API_BASE}/surveys/index.php?id=${survey.id}`, {
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
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { 
    fetchSurveys();
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
    const defaultSurvey: FormData = {
      title: 'Graduate Tracer Study Survey',
      description: 'Comprehensive survey for tracking graduate employment and career outcomes',
      status: 'draft',
      questions: [
        // SECTION 1: PERSONAL INFORMATION
        { question_text: 'Last Name', question_type: 'text', options: null, is_required: 1, sort_order: 1, section: 'Personal Information' },
        { question_text: 'First Name', question_type: 'text', options: null, is_required: 1, sort_order: 2, section: 'Personal Information' },
        { question_text: 'Middle Name', question_type: 'text', options: null, is_required: 0, sort_order: 3, section: 'Personal Information' },
        { question_text: 'Name Extension', question_type: 'multiple_choice', options: ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'VI'], is_required: 0, sort_order: 4, section: 'Personal Information' },
        { question_text: 'Region', question_type: 'multiple_choice', options: ['National Capital Region (NCR)', 'Cordillera Administrative Region (CAR)', 'Region I - Ilocos Region', 'Region II - Cagayan Valley', 'Region III - Central Luzon', 'Region IV - CALABARZON', 'Region V - Bicol Region', 'Region VI - Western Visayas', 'Region VII - Central Visayas', 'Region VIII - Eastern Visayas', 'Region IX - Zamboanga Peninsula', 'Region X - Northern Mindanao', 'Region XI - Davao Region', 'Region XII - SOCCSKSARGEN', 'Region XIII - Caraga', 'BARMM' ], is_required: 1, sort_order: 4, section: 'Personal Information' },
        { question_text: 'Province', question_type: 'text', options: null, is_required: 1, sort_order: 5, section: 'Personal Information' },
        { question_text: 'City / Municipality', question_type: 'text', options: null, is_required: 1, sort_order: 6, section: 'Personal Information' },
        { question_text: 'Email Address', question_type: 'text', options: null, is_required: 1, sort_order: 7, section: 'Personal Information' },
        { question_text: 'Mobile Number', question_type: 'text', options: null, is_required: 1, sort_order: 8, section: 'Personal Information' },
        { question_text: 'Telephone or Contact Number', question_type: 'text', options: null, is_required: 0, sort_order: 9, section: 'Personal Information' },
        { question_text: 'Civil Status', question_type: 'multiple_choice', options: ['Single', 'Married', 'Separated', 'Single Parent', 'Widowed'], is_required: 1, sort_order: 10, section: 'Personal Information' },
        { question_text: 'Sex', question_type: 'multiple_choice', options: ['Male', 'Female'], is_required: 1, sort_order: 11, section: 'Personal Information' },
        { question_text: 'Birthday', question_type: 'date', options: null, is_required: 1, sort_order: 12, section: 'Personal Information' },
        
        // SECTION 2: EDUCATIONAL BACKGROUND
        { question_text: 'Degree Program & Specialization', question_type: 'multiple_choice', options: ['Bachelor of Secondary Education Major in General Science', 'Bachelor of Elementary Education', 'Bachelor of Science in Hospitality Management', 'Bachelor of Science in Computer Science', 'Associate in Computer Technology' ], is_required: 1, sort_order: 13, section: 'Educational Background' },
        { question_text: 'Year Graduated', question_type: 'multiple_choice', options: ['2021', '2022', '2023', '2024', '2025'], is_required: 1, sort_order: 14, section: 'Educational Background' },
        { question_text: 'Honors / Awards Received', question_type: 'checkbox', options: ['Cum Laude', 'Magna Cum Laude', 'Leadership Award', 'Best in Thesis', 'Dean\'s lister', 'Academic Excellence', 'Other' ], is_required: 0, sort_order: 15, section: 'Educational Background' },
        { question_text: 'Professional Examination(s) Passed (if applicable)', question_type: 'header', options: null, is_required: 0, sort_order: 16, section: 'Educational Background' },
        { question_text: 'Name of Examination', question_type: 'radio', options: ['Licensure Examination for Teachers', 'Civil Service Examination'], is_required: 0, sort_order: 17, section: 'Educational Background' },
        { question_text: 'Date Taken', question_type: 'date', options: null, is_required: 0, sort_order: 18, section: 'Educational Background' },
        { question_text: 'Rating', question_type: 'text', options: null, is_required: 0, sort_order: 19, section: 'Educational Background' },
        { question_text: 'Reason(s) for taking the course / pursuing the degree', question_type: 'checkbox', options: ['High grades in the course/subject area(s) related to the course', 'Good grades in high school', 'Influence of parents/relatives', 'Peer influence', 'Inspired by a role model', 'Strong passion for the profession', 'Prospect for immediate employment', 'Status/prestige of profession', 'Availability of the course in chosen institution', 'Prospect for career advancement', 'Affordable for family', 'Prospect of attractive compensation', 'Opportunity for employment abroad', 'No particular choice / no better idea'], is_required: 0, sort_order: 20, section: 'Educational Background' },
        
        // SECTION 3: TRAININGS ATTENDED AFTER COLLEGE
        { question_text: 'Title of Training', question_type: 'text', options: null, is_required: 0, sort_order: 22, section: 'Trainings Attended After College' },
        { question_text: 'Duration', question_type: 'text', options: null, is_required: 0, sort_order: 23, section: 'Trainings Attended After College' },
        { question_text: 'Name of Training Institution', question_type: 'text', options: null, is_required: 0, sort_order: 24, section: 'Trainings Attended After College' },
        
        // SECTION 4: GRADUATE STUDIES
        { question_text: 'Name of Graduate Program', question_type: 'radio', options: ['Master of Arts in Education', 'Master of Science in Computer Science', 'Master of Science in Hospitality Management'], is_required: 0, sort_order: 25, section: 'Graduate Studies' },
        { question_text: 'Earned Units', question_type: 'text', options: null, is_required: 0, sort_order: 26, section: 'Graduate Studies' },
        { question_text: 'Name of College/University', question_type: 'text', options: null, is_required: 0, sort_order: 27, section: 'Graduate Studies' },
        { question_text: 'What made you pursue advance studies?', question_type: 'radio', options: ['For promotion', 'For professional development'], is_required: 0, sort_order: 28, section: 'Graduate Studies' },
        
        // SECTION 5: EMPLOYMENT DATA
        { question_text: 'Are you presently employed?', question_type: 'multiple_choice', options: ['Yes', 'No'], is_required: 1, sort_order: 29, section: 'Employment Data' },
        { question_text: 'Present Employment Status', question_type: 'multiple_choice', options: ['Regular/Permanent', 'Temporary', 'Casual', 'Contractual', 'Self-employed'], is_required: 0, sort_order: 30, section: 'Employment Data' },
        { question_text: 'If self-employed, what skills acquired in college were you able to apply in your work?', question_type: 'text', options: null, is_required: 0, sort_order: 31, section: 'Employment Data' },
        { question_text: 'Present Occupation (e.g., Grade School Teacher, Engineer, Self-employed)', question_type: 'text', options: null, is_required: 0, sort_order: 32, section: 'Employment Data' },
        { question_text: 'Major line of business of the company you are presently employed in', question_type: 'multiple_choice', options: ['Agriculture, Hunting and Forestry', 'Fishing', 'Mining and Quarrying', 'Manufacturing', 'Electricity, Gas and Water Supply', 'Construction', 'Wholesale and Retail Trade; repair of motor vehicles, motorcycles, and personal household goods', 'Hotel and Restaurants', 'Transport, Storage and Communications', 'Financial Intermediation', 'Real Estate, Renting and Business Activities', 'Public Administration and Defense; Compulsory and Social Security', 'Education', 'Health and Social Work', 'Other Community, Social and Personal Service Activities', 'Private Households and Employed Persons', 'Extra-territorial Organizations and Bodies'], is_required: 0, sort_order: 33, section: 'Employment Data' },
        { question_text: 'Place of work', question_type: 'multiple_choice', options: ['Local', 'Abroad'], is_required: 1, sort_order: 34, section: 'Employment Data' },
        { question_text: 'Is this your first job after college?', question_type: 'multiple_choice', options: ['Yes', 'No (please proceed to Question 37 and 38)'], is_required: 1, sort_order: 35, section: 'Employment Data' },
        { question_text: 'If YES, what are your reason(s) for staying on the job?', question_type: 'checkbox', options: ['Salaries and benefits', 'Career challenge', 'Related to special skill', 'Related to course/program of study', 'Proximity to residence', 'Peer influence', 'Family influence'], is_required: 0, sort_order: 36, section: 'Employment Data' },
        { question_text: 'Is your first job related to the course you took up in college?', question_type: 'multiple_choice', options: ['Yes', 'No'], is_required: 1, sort_order: 37, section: 'Employment Data' },
        { question_text: 'What were your reason(s) for changing job?', question_type: 'checkbox', options: ['Salaries and benefits', 'Career challenge', 'Related to special skills', 'Proximity to residence'], is_required: 0, sort_order: 38, section: 'Employment Data' },
        { question_text: 'How long did you stay in your first job?', question_type: 'multiple_choice', options: ['Less than a month', '1-6 months', '7-11 months', '1 year to less than 2 years', '2 years to less than 3 years', 'More than 3 years'], is_required: 0, sort_order: 39, section: 'Employment Data' },
        { question_text: 'How did you find your first job?', question_type: 'multiple_choice', options: ['Response to job advertisement', 'Walk-in applicant', 'Recommended by someone', 'Information from friends', 'Arranged by school’s job placement officer', 'Family business', 'Job Fair / PESO'], is_required: 0, sort_order: 40, section: 'Employment Data' },
        { question_text: 'How long did it take to land your first job?', question_type: 'multiple_choice', options: ['Less than a month', '1-6 months', '7-11 months', '1 year to less than 2 years', '2 years to less than 3 years', 'More than 3 years'], is_required: 0, sort_order: 41, section: 'Employment Data' },
        { question_text: 'Job Level Position', question_type: 'multiple_choice', options: ['Rank and File', 'Supervisory', 'Managerial', 'Executive'], is_required: 0, sort_order: 42, section: 'Employment Data' },
        { question_text: 'What is your initial gross monthly earning in your first job after college?', question_type: 'multiple_choice', options: ['Below ₱5,000.00', '₱5,000.00 to less than ₱10,000.00', '₱10,000.00 to less than ₱15,000.00 ', '₱15,000.00 to less than ₱20,000.00', '₱20,000.00 to less than ₱25,000.00', '₱25,000 and above'], is_required: 0, sort_order: 43, section: 'Employment Data' },
        { question_text: 'Was the college curriculum relevant to your first job?', question_type: 'multiple_choice', options: ['Yes', 'No'], is_required: 1, sort_order: 44, section: 'Employment Data' },
        { question_text: 'If YES, what competencies were useful?', question_type: 'checkbox', options: ['Communication skills', 'Human relations skills', 'Entrepreneurial skills', 'Information Technology skills', 'Problem-solving skills', 'Critical Thinking skills'], is_required: 0, sort_order: 45, section: 'Employment Data' },
        { question_text: 'Reason(s) why you are not yet employed', question_type: 'checkbox', options: ['Advance or further study', 'Family concern and decided not to find a job', 'Health-related reason(s)', 'Lack of work experience', 'No job opportunity', 'Did not look for a job'], is_required: 0, sort_order: 46, section: 'Employment Data' },
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

  const clearAllSurveys = () => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: '⚠️ WARNING: This will permanently delete ALL surveys, questions, and responses. This action cannot be undone. Are you ABSOLUTELY sure?',
      onConfirm: () => {
        fetch(`${API_BASE}/surveys/clear.php`, {
          method: 'POST',
              credentials: 'include',
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) {
              setMsgBox({ isOpen: true, type: 'success', message: 'All survey data has been cleared successfully.' });
              fetchSurveys();
            } else {
              setMsgBox({ isOpen: true, type: 'error', message: 'Error clearing surveys: ' + res.error });
            }
          })
          .catch(() => setMsgBox({ isOpen: true, type: 'error', message: 'Failed to clear surveys' }));
      }
    });
  };

  const openEdit = (s: Survey) => {
    fetch(`${API_BASE}/surveys/index.php?id=${s.id}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const d = res.data;
          console.log('Editing survey data from server:', d);
          setFormData({
            id: d.id,
            title: d.title,
            description: d.description || '',
            status: d.status,
            questions: (d.questions || []).map((q: any) => {
              const parsedQuestion: Question = {
                ...q,
                question_type: q.question_type || 'text',
                options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
              };
              if (isProfessionalExamHeader(parsedQuestion)) {
                parsedQuestion.question_text = getQuestionDisplayText(parsedQuestion);
                parsedQuestion.question_type = 'header';
                parsedQuestion.options = null;
                parsedQuestion.is_required = 0;
              }
              console.log('Parsed question:', parsedQuestion);
              return parsedQuestion;
            }),
          });
          setIsEditing(true);
          setShowModal(true);
        }
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const conflictingActiveSurvey = surveys.find((survey) => survey.status === 'active' && survey.id !== formData.id);

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

    const method = isEditing ? 'PUT' : 'POST';
    console.log('Submitting survey data:', formData);
    fetch(`${API_BASE}/surveys/index.php`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(formData),
    })
      .then((r) => r.json())
      .then((res) => {
        console.log('Server response:', res);
        if (res.success) {
          setShowModal(false);
          fetchSurveys();
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
      });
  };

  const handleDelete = (id: number) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: 'Delete this survey and all its responses?',
      confirmText: 'Yes, Delete!',
      cancelText: 'No, keep it.',
      onConfirm: () => {
        fetch(`${API_BASE}/surveys/index.php`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id }),
        })
          .then((r) => r.json())
          .then((res) => { if (res.success) fetchSurveys(); });
      }
    });
  };

  const updateQuestion = (index: number, field: keyof Question, value: string | string[] | number | null) => {
    setFormData((prev) => {
      const questions = [...prev.questions];
      questions[index] = { ...questions[index], [field]: value };
      return { ...prev, questions };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-900 sm:text-3xl">Survey Management</h1>
          <p className="text-sm text-gray-500 mt-1">{surveys.length} surveys created</p>
          {activeSurvey && (
            <p className="text-xs text-amber-700 mt-1">
              Set "{activeSurvey.title}" to inactive before creating another survey.
            </p>
          )}
        </div>
        <div className="flex w-full gap-3 sm:w-auto">
          <button onClick={openAdd} className={`${createSurveyButtonClass} w-full justify-center sm:w-auto`} title={activeSurvey ? 'Inactive the active survey first' : 'Create Survey'}>
            <Plus className="w-5 h-5" /> Create Survey
          </button>
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
          <p className="text-gray-600 text-lg font-medium">No surveys yet</p>
          <p className="text-gray-500 text-sm mb-6">Create your first survey using the Graduate Tracer Study template</p>
          <button onClick={openAdd} className={`${createSurveyButtonClass} mx-auto`}>
            <Plus className="w-5 h-5" /> Create Survey
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={clearAllSurveys} className="flex w-full items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors font-semibold text-sm sm:w-auto">
              <Trash2 className="w-4 h-4" /> Clear All Surveys
            </button>
          </div>
          <div className="grid gap-4">
          {surveys.map((s) => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow hover:border-yellow-200 overflow-hidden">
              <div className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-blue-900 sm:text-xl">{s.title}</h3>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${statusStyle[s.status] || 'bg-gray-100'}`}>
                        {s.status}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-4">{s.description}</p>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 sm:gap-6">
                      <span className="flex items-center gap-1"><ClipboardList className="w-4 h-4" /> {getAnswerableQuestionCount(s.questions, s.question_count)} questions</span>
                      <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> {s.response_count} responses</span>
                      <span>Created: {new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                    <button onClick={() => navigate(`/admin/surveys/${s.id}`)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors font-medium" title="View Details">
                      <Info className="w-5 h-5" />
                    </button>
                    <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-yellow-50 text-yellow-600 transition-colors font-medium" title="Edit">
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors font-medium" title="Delete">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Questions Preview Section */}
                {s.questions && s.questions.length > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <button
                      onClick={() => setExpandedSurvey(expandedSurvey === s.id ? null : s.id)}
                      className="w-full flex items-center justify-between text-left hover:bg-blue-50 p-2 rounded transition"
                    >
                      <h4 className="font-semibold text-blue-900">Preview Questions</h4>
                      {expandedSurvey === s.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      )}
                    </button>

                    {expandedSurvey === s.id && (
                      <div className="mt-4 space-y-3 bg-blue-50 p-4 rounded-lg max-h-80 overflow-y-auto">
                        {s.questions.map((q, idx) => {
                          const isHeader = isHeaderQuestion(q);

                          return (
                            <div key={idx} className="bg-white rounded-lg p-3 border border-blue-100">
                              <p className={`text-sm font-semibold mb-2 ${isHeader ? 'text-gray-900' : 'text-blue-900'}`}>
                                {isHeader ? `${idx + 1}. ` : `Q${idx + 1}: `}{getQuestionDisplayText(q)}
                                {!isHeader && q.is_required ? <span className="text-red-500 ml-1">*</span> : null}
                              </p>
                              <p className="text-xs text-gray-500 capitalize mb-2">{isHeader ? 'Header' : q.question_type.replace('_', ' ')}</p>
                              {!isHeader && q.options && Array.isArray(q.options) && q.options.length > 0 && (
                                <div className="space-y-1 ml-2">
                                  {q.options.map((option, oi) => (
                                    <div key={oi} className="text-xs text-gray-700 flex items-center gap-2">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between gap-4 p-4 border-b bg-white rounded-t-2xl flex-shrink-0 sm:p-6">
              <h2 className="text-xl font-bold text-blue-900 sm:text-2xl">
                {isEditing ? 'Edit Survey' : 'Create New Survey'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-6 sm:p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-blue-900 mb-2">Survey Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                      placeholder="Enter survey title"
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-blue-900 mb-2">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      placeholder="Describe the purpose of this survey"
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-blue-900 mb-2">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Questions */}
                <div className="border-t pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-blue-900">Questions ({getAnswerableQuestionCount(formData.questions)})</h3>
                  </div>

                  {/* Section Input Helper */}
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900 font-semibold mb-2">💡 Tip: Group questions by section</p>
                    <p className="text-xs text-blue-700">Enter the same section name (e.g., "Personal Information") for multiple questions to group them together. Section headers will automatically appear on the survey.</p>
                  </div>

                  <div className="space-y-3">
                    {formData.questions.map((q, i) => {
                      const prevSection = i > 0 ? formData.questions[i - 1].section : null;
                      const showSectionBadge = q.section && q.section !== prevSection;
                      const isHeader = isHeaderQuestion(q);
                      
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
                                  {isHeader ? `Header ${i + 1}: ` : `Q${i + 1}: `}{q.question_text ? getQuestionDisplayText(q) : '(untitled)'}
                                </span>
                                {q.section && (
                                  <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded-full">
                                    {q.section}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {expandedQ === i ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                              </div>
                            </div>

                            {expandedQ === i && (
                              <div className="p-4 space-y-4 bg-gray-50">
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Section <span className="text-xs text-gray-500">(Group related questions together)</span>
                                  </label>
                                  <select
                                    value={q.section || ''}
                                    onChange={(e) => updateQuestion(i, 'section', e.target.value)}
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
                                    onChange={(e) => updateQuestion(i, 'section', e.target.value)}
                                    placeholder="Or type a custom section name"
                                    className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">{isHeader ? 'Header Text' : 'Question Text'}</label>
                                  <input
                                    type="text"
                                    value={q.question_text}
                                    onChange={(e) => updateQuestion(i, 'question_text', e.target.value)}
                                    placeholder={isHeader ? 'Enter your header' : 'Enter your question'}
                                    className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                                    <select
                                      value={q.question_type || 'text'}
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
                                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
                                    >
                                      <option value="header">Header</option>
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
                                        No, display only
                                      </div>
                                    ) : (
                                      <select
                                        value={q.is_required}
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
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Options (one per line)</label>
                                    <textarea
                                      value={q.options?.join('\n') || ''}
                                      onChange={(e) => updateQuestion(i, 'options', e.target.value.split('\n'))}
                                      rows={4}
                                      placeholder="Option 1&#10;Option 2&#10;Option 3"
                                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 flex-shrink-0">
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
      />
    </div>
  );
}
