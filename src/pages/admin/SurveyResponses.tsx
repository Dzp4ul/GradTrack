import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Download } from 'lucide-react';

const API_BASE = '/api';

interface Response {
  id: number;
  survey_id: number;
  graduate_id: number | null;
  first_name: string;
  last_name: string;
  responses: Record<string, any>;
  submitted_at: string;
}

export default function SurveyResponses() {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (surveyId) {
      fetchResponses();
    }
  }, [surveyId]);

  const fetchResponses = async () => {
    try {
      const response = await fetch(`${API_BASE}/surveys/responses.php?survey_id=${surveyId}`);
      const data = await response.json();

      if (data.success) {
        setResponses(data.data);
      }
    } catch (error) {
      console.error('Error fetching responses:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (responses.length === 0) {
      alert('No responses to download');
      return;
    }

    // Prepare CSV data
    const headers = ['Respondent Name', 'Email/ID', 'Submitted At', 'Response Data'];
    const rows = responses.map((r) => [
      `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      r.graduate_id || 'Anonymous',
      new Date(r.submitted_at).toLocaleDateString(),
      JSON.stringify(r.responses),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-responses-${surveyId}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/surveys')}
            className="flex items-center gap-2 text-blue-900 hover:text-blue-700 font-semibold"
          >
            <ChevronLeft className="w-5 h-5" />
            Back to Surveys
          </button>
          <div>
            <h1 className="text-3xl font-bold text-blue-900">Survey Responses</h1>
            <p className="text-sm text-gray-500 mt-1">{responses.length} responses</p>
          </div>
        </div>
        <button
          onClick={downloadCSV}
          disabled={responses.length === 0}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg"
        >
          <Download className="w-5 h-5" />
          Export CSV
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
        </div>
      ) : responses.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-600 text-lg font-medium">No responses yet</p>
          <p className="text-gray-500 text-sm">Responses will appear here as alumni submit the survey</p>
        </div>
      ) : (
        <div className="space-y-4">
          {responses.map((r) => (
            <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-blue-900">
                    {`${r.first_name || 'Unknown'} ${r.last_name || 'Respondent'}`.trim()}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Submitted: {new Date(r.submitted_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                <div className="min-w-max">
                  {Object.entries(r.responses).map(([key, value]) => (
                    <div key={key} className="mb-3 last:mb-0">
                      <span className="inline-block bg-blue-100 text-blue-900 text-xs font-semibold px-2.5 py-1 rounded mb-2">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
