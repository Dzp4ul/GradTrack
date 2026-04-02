import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { Download, Users, Briefcase, Target, FileText, ClipboardList, Sparkles, TrendingUp } from 'lucide-react';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;

interface Overview {
  total_graduates: number;
  total_employed: number;
  total_employed_local: number;
  total_employed_abroad: number;
  total_aligned: number;
  total_survey_responses: number;
  employment_rate: number;
  alignment_rate: number;
}

interface ProgramReport {
  code: string;
  name: string;
  total_graduates: number;
  employed: number;
  aligned: number;
  partially_aligned: number;
  not_aligned: number;
  avg_time_to_employment: number;
  avg_salary: number;
}

interface YearReport {
  year_graduated: number;
  total_graduates: number;
  employed: number;
  aligned: number;
  avg_salary: number;
}

interface StatusData {
  employment_status: string;
  count: number;
}

interface SalaryData {
  salary_range: string;
  count: number;
}

interface PredictiveData {
  historical_data: Array<{
    year: number;
    total_graduates: number;
    employed: number;
    aligned: number;
    employment_rate: number;
    alignment_rate: number;
  }>;
  predictions: Array<{
    year: number;
    predicted_employment_rate: number;
    predicted_alignment_rate: number;
    confidence: number;
  }>;
  regression_analysis: {
    employment: {
      slope: number;
      intercept: number;
      r_squared: number;
      trend: string;
    };
    alignment: {
      slope: number;
      intercept: number;
      r_squared: number;
      trend: string;
    };
  };
  ai_analysis: string;
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const PROGRAM_COLORS: Record<string, string> = {
  'BSCS': 'rgb(255, 196, 0)',
  'BSHM': '#ef4444',
  'BSED': '#3b82f6',
  'BEED': '#7dd3fc',
  'ACT': '#6b7280',
};

export default function Reports() {
  const [tab, setTab] = useState<'overview' | 'program' | 'year' | 'employment' | 'salary' | 'surveys' | 'predictive'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [programData, setProgramData] = useState<ProgramReport[]>([]);
  const [yearData, setYearData] = useState<YearReport[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [salaryData, setSalaryData] = useState<SalaryData[]>([]);
  const [predictiveData, setPredictiveData] = useState<PredictiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const navigate = useNavigate();

  const fetchReport = (type: string, year: string = 'all') => {
    setLoading(true);
    const url = year !== 'all' ? `${API_BASE}/reports/index.php?type=${type}&year=${year}` : `${API_BASE}/reports/index.php?type=${type}`;
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          switch (type) {
            case 'overview': setOverview(res.data); break;
            case 'by_program': setProgramData(res.data); break;
            case 'by_year': 
              setYearData(res.data);
              const years = res.data.map((y: YearReport) => y.year_graduated.toString());
              setAvailableYears(years);
              break;
            case 'employment_status': setStatusData(res.data); break;
            case 'salary_distribution': setSalaryData(res.data); break;
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchPredictiveAnalytics = () => {
    setLoading(true);
    fetch(`${API_BASE}/reports/predictive-analytics.php`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setPredictiveData(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch(`${API_BASE}/reports/index.php?type=by_year`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const years = res.data.map((y: YearReport) => y.year_graduated.toString());
          setAvailableYears(years);
        }
      })
      .catch(() => {});
    
    fetch(`${API_BASE}/reports/index.php?type=by_program`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setProgramData(res.data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const typeMap: Record<string, string> = {
      overview: 'overview', program: 'by_program', year: 'by_year',
      employment: 'employment_status', salary: 'salary_distribution',
    };
    
    if (tab === 'predictive') {
      fetchPredictiveAnalytics();
    } else if (tab !== 'surveys') {
      fetchReport(typeMap[tab], selectedYear);
    }
    
    if (tab === 'overview') {
      fetchAIAnalytics();
    }
  }, [tab, selectedYear]);

  const fetchAIAnalytics = () => {
    setAiLoading(true);
    fetch(`${API_BASE}/reports/ai-analytics.php`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.ai_analysis) {
          setAiAnalysis(res.data.ai_analysis);
        }
      })
      .catch(() => {
        setAiAnalysis('AI analysis temporarily unavailable.');
      })
      .finally(() => setAiLoading(false));
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'program', label: 'By Program' },
    { key: 'year', label: 'By Year' },
    { key: 'employment', label: 'Employment Status' },
    { key: 'salary', label: 'Salary Distribution' },
    { key: 'predictive', label: 'Predictive Analytics' },
    { key: 'surveys', label: 'Survey Analytics' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Reports & Analytics</h1>
          <p className="text-sm text-gray-500">Graduate employment data insights</p>
        </div>
        <div className="flex items-center gap-3">
          {(tab === 'program' || tab === 'employment' || tab === 'salary') && availableYears.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Filter by Year:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}
          <button className="flex items-center gap-2 border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="flex border-b overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'border-b-2 border-[#1b2a4a] text-[#1b2a4a]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1b2a4a]" />
            </div>
          ) : (
            <>
              {tab === 'predictive' && predictiveData && (
                <div className="space-y-6">
                  <div className="border rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-[#1b2a4a] mb-4">Employment Rate Forecast (Next 3 Years)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={[
                        ...predictiveData.historical_data.map(d => ({
                          year: d.year,
                          employment_rate: d.employment_rate,
                          type: 'Historical'
                        })),
                        ...predictiveData.predictions.map(d => ({
                          year: d.year,
                          employment_rate: d.predicted_employment_rate,
                          type: 'Predicted'
                        }))
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="employment_rate" 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="Employment Rate (%)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="border rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-[#1b2a4a] mb-4">Predictions for Next 3 Years</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Year</th>
                            <th className="text-center px-4 py-3 font-semibold text-gray-600">Predicted Employment Rate</th>
                            <th className="text-center px-4 py-3 font-semibold text-gray-600">Predicted Alignment Rate</th>
                            <th className="text-center px-4 py-3 font-semibold text-gray-600">Confidence (R²)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {predictiveData.predictions.map((pred) => (
                            <tr key={pred.year} className="border-t hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium">{pred.year}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center gap-1">
                                  {pred.predicted_employment_rate}%
                                  {predictiveData.regression_analysis.employment.trend === 'increasing' && (
                                    <TrendingUp className="w-4 h-4 text-green-600" />
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center gap-1">
                                  {pred.predicted_alignment_rate}%
                                  {predictiveData.regression_analysis.alignment.trend === 'increasing' && (
                                    <TrendingUp className="w-4 h-4 text-green-600" />
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">{pred.confidence}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border rounded-xl p-5 bg-blue-50">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3">Employment Rate Trend</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Trend:</span>
                          <span className="font-semibold capitalize text-blue-900">
                            {predictiveData.regression_analysis.employment.trend}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Slope:</span>
                          <span className="font-semibold text-blue-900">
                            {predictiveData.regression_analysis.employment.slope.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">R² (Accuracy):</span>
                          <span className="font-semibold text-blue-900">
                            {(predictiveData.regression_analysis.employment.r_squared * 100).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-xl p-5 bg-orange-50">
                      <h4 className="text-sm font-semibold text-orange-900 mb-3">Alignment Rate Trend</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Trend:</span>
                          <span className="font-semibold capitalize text-orange-900">
                            {predictiveData.regression_analysis.alignment.trend}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Slope:</span>
                          <span className="font-semibold text-orange-900">
                            {predictiveData.regression_analysis.alignment.slope.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">R² (Accuracy):</span>
                          <span className="font-semibold text-orange-900">
                            {(predictiveData.regression_analysis.alignment.r_squared * 100).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-2 border-green-200 rounded-xl p-6 bg-gradient-to-br from-green-50 via-emerald-50 to-white shadow-lg">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-gradient-to-br from-green-600 to-emerald-600 rounded-lg shadow-md">
                        <TrendingUp className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-lg font-bold text-[#1b2a4a]">AI-Powered Predictive Insights</h3>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Linear Regression</span>
                        </div>
                        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                          {predictiveData.ai_analysis.split('\n\n').map((paragraph, idx) => (
                            <p key={idx} className="text-justify">{paragraph}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#1b2a4a]">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub} rate</p>}
    </div>
  );
}
