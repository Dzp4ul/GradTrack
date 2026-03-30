import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, TrendingUp, Target, Clock, Download,
  BarChart3, PieChart as PieChartIcon, CheckCircle2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface QuestionAnalytics {
  question_id: number;
  question_text: string;
  question_type: string;
  total_answers: number;
  data: any;
}

interface EmploymentInsights {
  employment_rate: number;
  employed_count: number;
  unemployed_count: number;
  alignment_rate: number;
  aligned_count: number;
  partially_aligned_count: number;
  not_aligned_count: number;
  salary_distribution: Record<string, number>;
  time_to_job_distribution: Record<string, number>;
}

interface Analytics {
  survey_id: number;
  survey_title: string;
  total_responses: number;
  response_rate: number;
  completion_rate: number;
  questions_analytics: QuestionAnalytics[];
  employment_insights?: EmploymentInsights;
}

export default function SurveyAnalytics() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (surveyId) {
      fetchAnalytics();
    }
  }, [surveyId]);

  const fetchAnalytics = () => {
    setLoading(true);
    fetch(`${API_BASE}/surveys/analytics.php?survey_id=${surveyId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setAnalytics(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load analytics data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/surveys')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-blue-900">{analytics.survey_title}</h1>
            <p className="text-sm text-gray-500">Survey Analytics & Insights</p>
          </div>
        </div>
        <button className="flex items-center gap-2 border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
          <Download className="w-4 h-4" /> Export Report
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Responses"
          value={analytics.total_responses.toString()}
          color="bg-blue-100 text-blue-700"
        />
        <StatCard
          icon={TrendingUp}
          label="Response Rate"
          value={`${analytics.response_rate}%`}
          color="bg-green-100 text-green-700"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completion Rate"
          value={`${analytics.completion_rate}%`}
          color="bg-purple-100 text-purple-700"
        />
        <StatCard
          icon={BarChart3}
          label="Questions"
          value={analytics.questions_analytics.length.toString()}
          color="bg-orange-100 text-orange-700"
        />
      </div>

      {/* Employment Insights */}
      {analytics.employment_insights && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-bold text-blue-900 mb-6">Employment Insights</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Employment Rate */}
            <div className="border rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Target className="w-6 h-6 text-green-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Employment Rate</p>
                  <p className="text-3xl font-bold text-blue-900">
                    {analytics.employment_insights.employment_rate}%
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Employed:</span>
                  <span className="font-semibold">{analytics.employment_insights.employed_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Unemployed:</span>
                  <span className="font-semibold">{analytics.employment_insights.unemployed_count}</span>
                </div>
              </div>
            </div>

            {/* Alignment Rate */}
            <div className="border rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Target className="w-6 h-6 text-blue-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Job Alignment Rate</p>
                  <p className="text-3xl font-bold text-blue-900">
                    {analytics.employment_insights.alignment_rate}%
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Aligned:</span>
                  <span className="font-semibold text-green-600">{analytics.employment_insights.aligned_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Partially Aligned:</span>
                  <span className="font-semibold text-orange-600">{analytics.employment_insights.partially_aligned_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Not Aligned:</span>
                  <span className="font-semibold text-red-600">{analytics.employment_insights.not_aligned_count}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Salary Distribution */}
          {Object.keys(analytics.employment_insights.salary_distribution).length > 0 && (
            <div className="border rounded-xl p-5 mb-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-4">Salary Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={Object.entries(analytics.employment_insights.salary_distribution).map(([range, count]) => ({ range, count }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Time to Job Distribution */}
          {Object.keys(analytics.employment_insights.time_to_job_distribution).length > 0 && (
            <div className="border rounded-xl p-5">
              <h3 className="text-lg font-semibold text-blue-900 mb-4">Time to Find First Job</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={Object.entries(analytics.employment_insights.time_to_job_distribution).map(([time, count]) => ({ time, count }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Question Analytics */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-bold text-blue-900 mb-6">Question-by-Question Analysis</h2>
        
        <div className="space-y-8">
          {analytics.questions_analytics.map((qa, index) => (
            <div key={qa.question_id} className="border-b pb-6 last:border-b-0">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-blue-900 mb-1">
                  Q{index + 1}: {qa.question_text}
                </h3>
                <p className="text-sm text-gray-500">
                  {qa.total_answers} responses • {qa.question_type.replace('_', ' ')}
                </p>
              </div>

              {/* Multiple Choice / Rating */}
              {(qa.question_type === 'multiple_choice' || qa.question_type === 'rating') && Array.isArray(qa.data) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {qa.data.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-700">{item.option}</span>
                            <span className="font-semibold text-blue-900">{item.count} ({item.percentage}%)</span>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-64 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={qa.data}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="count"
                            label={({ option, percentage }: any) => `${option}: ${percentage}%`}
                          >
                            {qa.data.map((_: any, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* Checkbox */}
              {qa.question_type === 'checkbox' && Array.isArray(qa.data) && (
                <div className="space-y-3">
                  {qa.data.map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{item.option}</span>
                          <span className="font-semibold text-blue-900">{item.count} ({item.percentage}%)</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Text */}
              {qa.question_type === 'text' && qa.data && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-blue-900">{qa.data.total_responses}</p>
                      <p className="text-xs text-gray-600">Responses</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-900">{qa.data.avg_length}</p>
                      <p className="text-xs text-gray-600">Avg. Length</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-900">{qa.data.sample_responses?.length || 0}</p>
                      <p className="text-xs text-gray-600">Samples</p>
                    </div>
                  </div>
                  {qa.data.sample_responses && qa.data.sample_responses.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">Sample Responses:</p>
                      <div className="space-y-2">
                        {qa.data.sample_responses.map((response: string, i: number) => (
                          <div key={i} className="bg-white rounded p-3 text-sm text-gray-700 border">
                            "{response}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <p className="text-3xl font-bold text-blue-900">{value}</p>
    </div>
  );
}
