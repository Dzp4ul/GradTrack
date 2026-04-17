import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye } from 'lucide-react';
import { API_ROOT } from '../../config/api';

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
  external_description?: string;
  status: string;
  question_count: number;
  response_count: number;
  created_at: string;
  created_by?: string;
  modified_by?: string;
  modified_at?: string;
  questions?: Question[];
}

const isProfessionalExamHeader = (question: Question) =>
  question.question_text.toLowerCase().startsWith('professional examination(s) passed');

const isHeaderQuestion = (question: Question) =>
  question.question_type === 'header' || isProfessionalExamHeader(question);

const getQuestionDisplayText = (question: Question) =>
  isProfessionalExamHeader(question) && !question.question_text.toLowerCase().includes('if applicable')
    ? `${question.question_text} (if applicable)`
    : question.question_text;

export default function SurveyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'student' | 'reports'>('student');

  useEffect(() => {
    if (id) {
      fetch(`${API_ROOT}/surveys/index.php?id=${id}`, {
        credentials: 'include',
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.success) {
            const d = res.data;
            d.questions = (d.questions || []).map((q: Question) => ({
              ...q,
              options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            }));
            setSurvey(d);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Survey not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate('/admin/surveys')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h1 className="min-w-0 text-xl font-bold text-blue-900 sm:text-3xl">{survey.title}</h1>
        </div>
      </div>

      {/* Survey Information */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <h2 className="text-xl font-bold text-blue-900 mb-4">Survey Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <div>
            <label className="text-sm font-semibold text-gray-600">Survey Name</label>
            <p className="text-gray-900 mt-1">{survey.title}</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-600">Created By</label>
            <p className="text-gray-900 mt-1">{survey.created_by || 'N/A'}</p>
            <p className="text-xs text-gray-500">{new Date(survey.created_at).toLocaleString()}</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-600">Description</label>
            <p className="text-gray-900 mt-1">{survey.description}</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-600">Modified By</label>
            <p className="text-gray-900 mt-1">{survey.modified_by || 'N/A'}</p>
            {survey.modified_at && (
              <p className="text-xs text-gray-500">{new Date(survey.modified_at).toLocaleString()}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-600">External Description</label>
            <p className="text-gray-900 mt-1">{survey.external_description || survey.description}</p>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-sm font-semibold text-gray-600">Questions</label>
              <p className="text-gray-900">{survey.question_count}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-blue-900">Preview</h2>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              onClick={() => setViewMode('student')}
              className={`flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition sm:w-auto ${
                viewMode === 'student'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Eye className="w-4 h-4" /> Student View
            </button>
            <button
              onClick={() => navigate(`/admin/reports?tab=surveys&survey_id=${id}`)}
              className={`flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition sm:w-auto ${
                viewMode === 'reports'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Reports
            </button>
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg max-h-[600px] overflow-y-auto sm:p-6">
          {survey.questions?.map((q, idx) => {
            const prevSection = idx > 0 ? survey.questions![idx - 1].section : null;
            const showSectionHeader = q.section && q.section !== prevSection;
            const isHeader = isHeaderQuestion(q);

            return (
              <div key={idx}>
                {showSectionHeader && (
                  <div className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg mb-3 font-bold text-sm uppercase">
                    {q.section}
                  </div>
                )}
                <div className="bg-white rounded-lg p-5 border border-gray-200">
                  <div className="mb-3">
                    <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded mb-2 uppercase">
                      {isHeader ? 'Header' : q.question_type.replace('_', ' ')}
                    </span>
                    <p className="text-base font-semibold text-gray-900">
                      {idx + 1}. {getQuestionDisplayText(q)}
                      {!isHeader && q.is_required ? <span className="text-red-500 ml-1">*</span> : null}
                    </p>
                  </div>
                  {!isHeader && q.options && Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="space-y-2 ml-4">
                      {q.options.map((option, oi) => (
                        <div key={oi} className="flex items-center gap-3 text-gray-700">
                          {q.question_type === 'checkbox' ? (
                            <div className="w-4 h-4 border-2 border-gray-400 rounded flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-400 flex-shrink-0" />
                          )}
                          <span className="text-sm">{option}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!isHeader && q.question_type === 'text' && (
                    <div className="ml-4">
                      <input
                        type="text"
                        disabled
                        placeholder="Text answer"
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50"
                      />
                    </div>
                  )}
                  {!isHeader && q.question_type === 'date' && (
                    <div className="ml-4">
                      <input
                        type="date"
                        disabled
                        className="border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
