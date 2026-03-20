import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, X, ClipboardList, Eye, ChevronDown, ChevronUp, ShieldCheck, BarChart3,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api';

interface Question {
  id?: number;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: number;
  sort_order: number;
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

const emptyQuestion: Question = {
  question_text: '', question_type: 'text', options: null, is_required: 1, sort_order: 0,
};

const statusStyle: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  draft: 'bg-yellow-100 text-yellow-700',
};

export default function Surveys() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showView, setShowView] = useState(false);
  const [viewSurvey, setViewSurvey] = useState<Survey | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [expandedSurvey, setExpandedSurvey] = useState<number | null>(null);
  const navigate = useNavigate();

  const fetchSurveys = () => {
    setLoading(true);
    fetch(`${API_BASE}/surveys/index.php`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          // Fetch full details for each survey to get questions
          const surveysWithDetails = res.data.map((survey: Survey) => {
            fetch(`${API_BASE}/surveys/index.php?id=${survey.id}`)
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

  useEffect(() => { fetchSurveys(); }, []);

  const openAdd = () => {
    setFormData(emptyForm);
    setIsEditing(false);
    setShowModal(true);
  };

  const openEdit = (s: Survey) => {
    fetch(`${API_BASE}/surveys/index.php?id=${s.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const d = res.data;
          setFormData({
            id: d.id,
            title: d.title,
            description: d.description || '',
            status: d.status,
            questions: (d.questions || []).map((q: Question) => ({
              ...q,
              options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            })),
          });
          setIsEditing(true);
          setShowModal(true);
        }
      });
  };

  const openView = (s: Survey) => {
    fetch(`${API_BASE}/surveys/index.php?id=${s.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const d = res.data;
          d.questions = (d.questions || []).map((q: Question) => ({
            ...q,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
          }));
          setViewSurvey(d);
          setShowView(true);
        }
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    fetch(`${API_BASE}/surveys/index.php`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) { setShowModal(false); fetchSurveys(); }
      });
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this survey and all its responses?')) return;
    fetch(`${API_BASE}/surveys/index.php`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then((r) => r.json())
      .then((res) => { if (res.success) fetchSurveys(); });
  };

  const addQuestion = () => {
    setFormData((prev) => ({
      ...prev,
      questions: [...prev.questions, { ...emptyQuestion, sort_order: prev.questions.length + 1 }],
    }));
  };

  const updateQuestion = (index: number, field: keyof Question, value: string | string[] | number | null) => {
    setFormData((prev) => {
      const questions = [...prev.questions];
      questions[index] = { ...questions[index], [field]: value };
      return { ...prev, questions };
    });
  };

  const removeQuestion = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-blue-900">Survey Management</h1>
          <p className="text-sm text-gray-500 mt-1">{surveys.length} surveys created</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-6 py-2.5 rounded-lg transition-colors font-semibold shadow-md hover:shadow-lg">
          <Plus className="w-5 h-5" /> Create Survey
        </button>
      </div>

      {/* Survey Cards */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
        </div>
      ) : surveys.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">No surveys yet</p>
          <p className="text-gray-500 text-sm">Create your first survey to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {surveys.map((s) => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow hover:border-yellow-200 overflow-hidden">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-blue-900">{s.title}</h3>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${statusStyle[s.status] || 'bg-gray-100'}`}>
                        {s.status}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-4">{s.description}</p>
                    <div className="flex items-center gap-6 text-sm text-gray-500">
                      <span className="flex items-center gap-1"><ClipboardList className="w-4 h-4" /> {s.question_count} questions</span>
                      <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> {s.response_count} responses</span>
                      <span>Created: {new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    <button onClick={() => navigate(`/admin/surveys/${s.id}/responses`)} className="p-2 rounded-lg hover:bg-green-50 text-green-600 transition-colors font-medium" title="View Responses">
                      <BarChart3 className="w-5 h-5" />
                    </button>
                    <button onClick={() => openView(s)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors font-medium" title="View">
                      <Eye className="w-5 h-5" />
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
                        {s.questions.map((q, idx) => (
                          <div key={idx} className="bg-white rounded-lg p-3 border border-blue-100">
                            <p className="text-sm font-semibold text-blue-900 mb-2">
                              Q{idx + 1}: {q.question_text}
                              {q.is_required ? <span className="text-red-500 ml-1">*</span> : null}
                            </p>
                            <p className="text-xs text-gray-500 capitalize mb-2">{q.question_type.replace('_', ' ')}</p>
                            {q.options && Array.isArray(q.options) && q.options.length > 0 && (
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
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      {showView && viewSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h2 className="text-2xl font-bold text-blue-900">{viewSurvey.title}</h2>
                <p className="text-sm text-gray-500 mt-1">{viewSurvey.response_count} responses</p>
              </div>
              <button onClick={() => setShowView(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {viewSurvey.description && <p className="text-gray-700 text-base">{viewSurvey.description}</p>}
              {viewSurvey.questions?.map((q, i) => (
                <div key={i} className="bg-blue-50 rounded-xl border border-blue-100 p-5">
                  <p className="text-lg font-semibold text-blue-900 mb-2">
                    {i + 1}. {q.question_text} {q.is_required ? <span className="text-red-500 ml-1">*</span> : null}
                  </p>
                  <p className="text-xs text-gray-500 capitalize font-medium mb-3">{q.question_type.replace('_', ' ')}</p>
                  {q.options && Array.isArray(q.options) && (
                    <div className="space-y-2 ml-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-3 text-gray-700">
                          <div className="w-4 h-4 rounded-full border-2 border-blue-600 flex-shrink-0" />
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-2xl font-bold text-blue-900">
                {isEditing ? 'Edit Survey' : 'Create New Survey'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
                  <h3 className="text-lg font-bold text-blue-900">Questions ({formData.questions.length})</h3>
                  <button type="button" onClick={addQuestion} className="flex items-center gap-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-semibold transition">
                    <Plus className="w-4 h-4" /> Add Question
                  </button>
                </div>

                <div className="space-y-3">
                  {formData.questions.map((q, i) => (
                    <div key={i} className="border-2 border-gray-200 rounded-lg overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 bg-blue-50 cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                      >
                        <span className="text-sm font-semibold text-blue-900">
                          Q{i + 1}: {q.question_text || '(untitled)'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeQuestion(i); }} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {expandedQ === i ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                        </div>
                      </div>

                      {expandedQ === i && (
                        <div className="p-4 space-y-4 bg-gray-50">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Question Text</label>
                            <input
                              type="text"
                              value={q.question_text}
                              onChange={(e) => updateQuestion(i, 'question_text', e.target.value)}
                              placeholder="Enter your question"
                              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                              <select
                                value={q.question_type}
                                onChange={(e) => updateQuestion(i, 'question_type', e.target.value)}
                                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
                              >
                                <option value="text">Text</option>
                                <option value="multiple_choice">Multiple Choice</option>
                                <option value="rating">Rating</option>
                                <option value="checkbox">Checkbox</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Required</label>
                              <select
                                value={q.is_required}
                                onChange={(e) => updateQuestion(i, 'is_required', parseInt(e.target.value))}
                                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
                              >
                                <option value={1}>Yes</option>
                                <option value={0}>No</option>
                              </select>
                            </div>
                          </div>
                          {(q.question_type === 'multiple_choice' || q.question_type === 'checkbox') && (
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
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
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
    </div>
  );
}
