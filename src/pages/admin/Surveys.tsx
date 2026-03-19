import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, X, ClipboardList, Eye, ChevronDown, ChevronUp,
} from 'lucide-react';

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

  const fetchSurveys = () => {
    setLoading(true);
    fetch(`${API_BASE}/surveys/index.php`)
      .then((r) => r.json())
      .then((res) => { if (res.success) setSurveys(res.data); })
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
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Survey Management</h1>
          <p className="text-sm text-gray-500">{surveys.length} surveys</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-[#1b2a4a] text-white px-4 py-2.5 rounded-lg hover:bg-[#263c66] transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Create Survey
        </button>
      </div>

      {/* Survey Cards */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1b2a4a]" />
        </div>
      ) : surveys.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No surveys yet. Create your first survey!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {surveys.map((s) => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-[#1b2a4a]">{s.title}</h3>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${statusStyle[s.status] || 'bg-gray-100'}`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">{s.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{s.question_count} questions</span>
                    <span>{s.response_count} responses</span>
                    <span>Created: {new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button onClick={() => openView(s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="View">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      {showView && viewSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-[#1b2a4a]">{viewSurvey.title}</h2>
                <p className="text-sm text-gray-500">{viewSurvey.response_count} responses</p>
              </div>
              <button onClick={() => setShowView(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {viewSurvey.description && <p className="text-sm text-gray-600">{viewSurvey.description}</p>}
              {viewSurvey.questions?.map((q, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <p className="text-sm font-medium text-[#1b2a4a] mb-1">
                    {i + 1}. {q.question_text} {q.is_required ? <span className="text-red-500">*</span> : null}
                  </p>
                  <p className="text-xs text-gray-400 capitalize mb-2">{q.question_type.replace('_', ' ')}</p>
                  {q.options && Array.isArray(q.options) && (
                    <div className="space-y-1 ml-3">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2 text-sm text-gray-600">
                          <div className="w-3 h-3 border rounded-full border-gray-300" />
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
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-[#1b2a4a]">
                {isEditing ? 'Edit Survey' : 'Create Survey'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Questions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Questions ({formData.questions.length})</h3>
                  <button type="button" onClick={addQuestion} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                    <Plus className="w-4 h-4" /> Add Question
                  </button>
                </div>

                <div className="space-y-3">
                  {formData.questions.map((q, i) => (
                    <div key={i} className="border rounded-lg overflow-hidden">
                      <div
                        className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                      >
                        <span className="text-sm font-medium text-[#1b2a4a]">
                          Q{i + 1}: {q.question_text || '(untitled)'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeQuestion(i); }} className="p-1 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {expandedQ === i ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>

                      {expandedQ === i && (
                        <div className="p-3 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Question Text</label>
                            <input
                              type="text"
                              value={q.question_text}
                              onChange={(e) => updateQuestion(i, 'question_text', e.target.value)}
                              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                              <select
                                value={q.question_type}
                                onChange={(e) => updateQuestion(i, 'question_type', e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="text">Text</option>
                                <option value="multiple_choice">Multiple Choice</option>
                                <option value="rating">Rating</option>
                                <option value="checkbox">Checkbox</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Required</label>
                              <select
                                value={q.is_required}
                                onChange={(e) => updateQuestion(i, 'is_required', parseInt(e.target.value))}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value={1}>Yes</option>
                                <option value={0}>No</option>
                              </select>
                            </div>
                          </div>
                          {(q.question_type === 'multiple_choice' || q.question_type === 'checkbox') && (
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Options (one per line)</label>
                              <textarea
                                value={q.options?.join('\n') || ''}
                                onChange={(e) => updateQuestion(i, 'options', e.target.value.split('\n'))}
                                rows={3}
                                placeholder="Option 1&#10;Option 2&#10;Option 3"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2.5 bg-[#1b2a4a] text-white rounded-lg text-sm font-medium hover:bg-[#263c66] transition-colors">
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
