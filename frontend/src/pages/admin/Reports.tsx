import { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, Users, Briefcase, Target, FileText, Sparkles, TrendingUp, CheckCircle2, BarChart3 } from 'lucide-react';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;

interface Overview {
  total_graduates: number;
  total_employed: number;
  total_unemployed?: number;
  total_employment_known?: number;
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

interface SurveySummary {
  id: number;
  title: string;
  description: string;
  response_count: number;
  status: string;
}

interface SurveyQuestionAnalytics {
  question_id: number;
  question_text: string;
  question_type: string;
  total_answers: number;
  data: any;
}

interface SurveyEmploymentInsights {
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

interface SurveyAnalyticsData {
  survey_id: number;
  survey_title: string;
  total_responses: number;
  response_rate: number;
  completion_rate: number;
  questions_analytics: SurveyQuestionAnalytics[];
  employment_insights?: SurveyEmploymentInsights;
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
const REPORT_TABS = ['overview', 'program', 'year', 'employment', 'salary', 'surveys'] as const;
type ReportTab = typeof REPORT_TABS[number];
const SELECTED_SURVEY_STORAGE_KEY = 'gradtrack_selected_survey_id';

// Program-specific colors
const PROGRAM_COLORS: Record<string, string> = {
  'BSCS': 'rgb(255, 196, 0)',  // yellow
  'BSHM': '#ef4444',  // red
  'BSED': '#3b82f6',  // blue
  'BEED': '#7dd3fc',  // light blue
  'ACT': '#6b7280',   // gray
};

const DEFAULT_DEPARTMENTS = [
  { code: 'BSCS', name: 'Bachelor of Science in Computer Science' },
  { code: 'ACT', name: 'Associate in Computer Technology' },
  { code: 'BSED', name: 'Bachelor of Secondary Education' },
  { code: 'BEED', name: 'Bachelor of Elementary Education' },
  { code: 'BSHM', name: 'Bachelor of Science in Hospitality Management' },
];

type ExcelRow = Record<string, string | number>;

const normalizeSurveySummary = (survey: SurveySummary): SurveySummary => ({
  ...survey,
  id: Number(survey.id),
  response_count: Number(survey.response_count ?? 0),
});

export default function Reports() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialTabParam = initialParams.get('tab') as ReportTab | null;
  const initialSurveyId = Number(initialParams.get('survey_id') || localStorage.getItem(SELECTED_SURVEY_STORAGE_KEY));
  const [tab, setTab] = useState<ReportTab>(
    initialTabParam && REPORT_TABS.includes(initialTabParam) ? initialTabParam : 'overview'
  );
  const [overview, setOverview] = useState<Overview | null>(null);
  const [programData, setProgramData] = useState<ProgramReport[]>([]);
  const [yearData, setYearData] = useState<YearReport[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [salaryData, setSalaryData] = useState<SalaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<Array<{ code: string; name: string }>>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [surveyItems, setSurveyItems] = useState<SurveySummary[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(initialSurveyId > 0 ? initialSurveyId : null);
  const [surveyAnalytics, setSurveyAnalytics] = useState<SurveyAnalyticsData | null>(null);
  const [surveyAnalyticsLoading, setSurveyAnalyticsLoading] = useState(false);

  const buildReportUrl = (type: string, year: string = 'all', department: string = selectedDepartment) => {
    const params = new URLSearchParams({ type });
    if (selectedSurveyId) {
      params.set('survey_id', selectedSurveyId.toString());
    }
    if (year !== 'all') {
      params.set('year', year);
    }
    if (department !== 'all') {
      params.set('department', department);
    }

    return `${API_BASE}/reports/index.php?${params.toString()}`;
  };

  const getDefaultSurveyId = (surveys: SurveySummary[], currentId: number | null = selectedSurveyId) => {
    if (currentId && surveys.some((survey) => Number(survey.id) === currentId)) {
      return currentId;
    }

    const activeSurvey = surveys.find((survey) => survey.status === 'active');
    return activeSurvey ? Number(activeSurvey.id) : null;
  };

  const fetchReport = (type: string, year: string = 'all') => {
    setLoading(true);
    const url = buildReportUrl(type, year);
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          switch (type) {
            case 'overview': setOverview(res.data); break;
            case 'by_program': setProgramData(res.data); break;
            case 'by_year': 
              setYearData(res.data);
              // Extract available years from the data
              const years = res.data.map((y: YearReport) => y.year_graduated.toString());
              setAvailableYears(years);
              break;
            case 'employment_status': setStatusData(res.data); break;
            case 'salary_distribution': setSalaryData(res.data); break;
          }

          fetchAIAnalytics(type, res.data, year, selectedDepartment);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchSurveyItems = (loadAnalytics: boolean = false) => {
    if (loadAnalytics) {
      setSurveyLoading(true);
    }

    fetch(`${API_BASE}/surveys/index.php`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const surveys: SurveySummary[] = (res.data || []).map(normalizeSurveySummary);
          setSurveyItems(surveys);

          if (surveys.length === 0) {
            setSelectedSurveyId(null);
            setSurveyAnalytics(null);
            localStorage.removeItem(SELECTED_SURVEY_STORAGE_KEY);
            return;
          }

          const surveyIdToLoad = getDefaultSurveyId(surveys);
          setSelectedSurveyId(surveyIdToLoad);
          if (surveyIdToLoad) {
            localStorage.setItem(SELECTED_SURVEY_STORAGE_KEY, surveyIdToLoad.toString());
          } else {
            localStorage.removeItem(SELECTED_SURVEY_STORAGE_KEY);
          }
          if (loadAnalytics && surveyIdToLoad) {
            fetchSurveyAnalytics(surveyIdToLoad);
          } else if (loadAnalytics) {
            setSurveyAnalytics(null);
          }
        } else {
          setSurveyItems([]);
          setSelectedSurveyId(null);
          setSurveyAnalytics(null);
        }
      })
      .catch(() => {
        setSurveyItems([]);
        setSelectedSurveyId(null);
        setSurveyAnalytics(null);
      })
      .finally(() => {
        if (loadAnalytics) {
          setSurveyLoading(false);
        }
      });
  };

  const fetchSurveyAnalyticsList = () => {
    fetchSurveyItems(true);
  };

  const fetchSurveyAnalytics = (surveyId: number) => {
    setSurveyAnalyticsLoading(true);
    fetch(`${API_BASE}/surveys/analytics.php?survey_id=${surveyId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setSurveyAnalytics(res.data);
        } else {
          setSurveyAnalytics(null);
        }
      })
      .catch(() => setSurveyAnalytics(null))
      .finally(() => setSurveyAnalyticsLoading(false));
  };

  const handleSelectedSurveyChange = (surveyId: number | null) => {
    setSelectedSurveyId(surveyId);
    if (!surveyId) {
      setSurveyAnalytics(null);
      localStorage.removeItem(SELECTED_SURVEY_STORAGE_KEY);
      return;
    }

    localStorage.setItem(SELECTED_SURVEY_STORAGE_KEY, surveyId.toString());

    if (tab === 'surveys') {
      fetchSurveyAnalytics(surveyId);
    }
  };

  useEffect(() => {
    fetchSurveyItems();
  }, []);

  useEffect(() => {
    // Fetch year data first to populate the filter
    fetch(buildReportUrl('by_year', 'all', 'all'))
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const years = res.data.map((y: YearReport) => y.year_graduated.toString());
          setAvailableYears(years);
        }
      })
      .catch(() => {});
    
    // Fetch program data for overview
    fetch(buildReportUrl('by_program', 'all', 'all'))
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const allPrograms = res.data as ProgramReport[];
          setProgramData(allPrograms);
          const departments = allPrograms
            .filter((item) => item.code)
            .map((item) => ({ code: item.code, name: item.name || item.code }))
            .sort((a, b) => a.code.localeCompare(b.code));
          setAvailableDepartments(departments);
        }
      })
      .catch(() => {});
  }, [selectedSurveyId]);

  useEffect(() => {
    const typeMap: Record<string, string> = {
      overview: 'overview', program: 'by_program', year: 'by_year',
      employment: 'employment_status', salary: 'salary_distribution',
    };

    if (tab === 'surveys') {
      fetchSurveyAnalyticsList();
      return;
    }

    fetchReport(typeMap[tab], selectedYear);
  }, [tab, selectedYear, selectedDepartment, selectedSurveyId]);

  const fetchAIAnalytics = (
    reportType: string,
    reportData: unknown,
    year: string = selectedYear,
    department: string = selectedDepartment,
  ) => {
    setAiLoading(true);
    const params = new URLSearchParams({ type: reportType });
    if (year !== 'all') {
      params.set('year', year);
    }
    if (department !== 'all') {
      params.set('department', department);
    }
    if (selectedSurveyId) {
      params.set('survey_id', selectedSurveyId.toString());
    }

    fetch(`${API_BASE}/reports/ai-analytics.php?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        report_data: reportData,
        selected_survey_id: selectedSurveyId,
        selected_year: year,
        selected_department: department,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.ai_analysis) {
          setAiAnalysis(res.data.ai_analysis);
        } else {
          setAiAnalysis('AI analysis temporarily unavailable.');
        }
      })
      .catch(() => {
        setAiAnalysis('AI analysis temporarily unavailable.');
      })
      .finally(() => setAiLoading(false));
  };

  const handleExport = async () => {
    if (tab === 'surveys') {
      return;
    }

    const fetchReportData = async <T,>(
      type: string,
      applyYearFilter: boolean = false,
    ): Promise<T | null> => {
      const url = applyYearFilter
        ? buildReportUrl(type, selectedYear)
        : buildReportUrl(type, 'all');

      try {
        const response = await fetch(url);
        const result = await response.json();
        return result.success ? (result.data as T) : null;
      } catch {
        return null;
      }
    };

    const [overviewExport, programExport, yearExport, statusExport, salaryExport] = await Promise.all([
      overview ? Promise.resolve(overview) : fetchReportData<Overview>('overview'),
      programData.length ? Promise.resolve(programData) : fetchReportData<ProgramReport[]>('by_program', true),
      yearData.length ? Promise.resolve(yearData) : fetchReportData<YearReport[]>('by_year'),
      statusData.length ? Promise.resolve(statusData) : fetchReportData<StatusData[]>('employment_status', true),
      salaryData.length ? Promise.resolve(salaryData) : fetchReportData<SalaryData[]>('salary_distribution', true),
    ]);

    const overviewRows: ExcelRow[] = overviewExport
      ? [
          { Metric: 'Total Graduates', Value: overviewExport.total_graduates },
          { Metric: 'Total Employed', Value: overviewExport.total_employed },
          { Metric: 'Employed (Local)', Value: overviewExport.total_employed_local },
          { Metric: 'Employed (Abroad)', Value: overviewExport.total_employed_abroad },
          { Metric: 'Total Aligned', Value: overviewExport.total_aligned },
          { Metric: 'Survey Responses', Value: overviewExport.total_survey_responses },
          { Metric: 'Employment Rate (%)', Value: overviewExport.employment_rate },
          { Metric: 'Alignment Rate (%)', Value: overviewExport.alignment_rate },
        ]
      : [];

    const programRows: ExcelRow[] = (programExport ?? []).map((item) => ({
      'Program Code': item.code,
      'Program Name': item.name,
      'Total Graduates': item.total_graduates,
      Employed: item.employed,
      Aligned: item.aligned,
      'Partially Aligned': item.partially_aligned,
      'Not Aligned': item.not_aligned,
      'Avg Time to Employment (months)': item.avg_time_to_employment ?? '',
      'Avg Salary': item.avg_salary ?? '',
      'Employment Rate (%)': item.total_graduates > 0 ? Number(((item.employed / item.total_graduates) * 100).toFixed(1)) : 0,
      'Alignment Rate (%)': item.employed > 0 ? Number(((item.aligned / item.employed) * 100).toFixed(1)) : 0,
    }));

    const yearRows: ExcelRow[] = (yearExport ?? []).map((item) => ({
      'Year Graduated': item.year_graduated,
      'Total Graduates': item.total_graduates,
      Employed: item.employed,
      Aligned: item.aligned,
      'Avg Salary': item.avg_salary ?? '',
      'Employment Rate (%)': item.total_graduates > 0 ? Number(((item.employed / item.total_graduates) * 100).toFixed(1)) : 0,
      'Alignment Rate (%)': item.employed > 0 ? Number(((item.aligned / item.employed) * 100).toFixed(1)) : 0,
    }));

    const statusRows: ExcelRow[] = (statusExport ?? []).map((item) => ({
      'Employment Status': item.employment_status,
      Count: item.count,
    }));

    const salaryRows: ExcelRow[] = (salaryExport ?? []).map((item) => ({
      'Salary Range': item.salary_range,
      Count: item.count,
    }));

    if (!overviewRows.length && !programRows.length && !yearRows.length && !statusRows.length && !salaryRows.length) {
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GradTrack';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['GradTrack Report Export']);
    summarySheet.addRow(['Generated At', new Date().toLocaleString()]);
    summarySheet.addRow(['Year Filter', selectedYear === 'all' ? 'All Years' : selectedYear]);
    summarySheet.addRow(['Department Filter', selectedDepartment === 'all' ? 'All Departments' : selectedDepartment]);
    summarySheet.addRow(['Export Triggered From Tab', tab]);
    summarySheet.addRow([]);
    summarySheet.getRow(1).font = { bold: true, size: 14 };

    const addSheetFromRows = (sheetName: string, rows: ExcelRow[]) => {
      const sheet = workbook.addWorksheet(sheetName);

      if (!rows.length) {
        sheet.addRow(['No data available for this section.']);
        sheet.columns = [{ width: 42 }];
        return;
      }

      const columns = Object.keys(rows[0]);
      sheet.columns = columns.map((column) => ({
        header: column,
        key: column,
        width: Math.max(16, Math.min(42, column.length + 6)),
      }));

      rows.forEach((row) => sheet.addRow(row));

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1B2A4A' },
      };

      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = {
        from: 'A1',
        to: `${String.fromCharCode(64 + columns.length)}1`,
      };
    };

    addSheetFromRows('Overview', overviewRows);
    addSheetFromRows('By Program', programRows);
    addSheetFromRows('By Year', yearRows);
    addSheetFromRows('Employment Status', statusRows);
    addSheetFromRows('Salary Distribution', salaryRows);

    const chartsSheet = workbook.addWorksheet('Charts');
    chartsSheet.addRow(['Report Graphs']);
    chartsSheet.getRow(1).font = { bold: true, size: 14 };

    let nextChartTopRow = 3;

    const addChartImage = async (title: string, chartConfig: Record<string, unknown>) => {
      chartsSheet.getCell(`A${nextChartTopRow}`).value = title;
      chartsSheet.getCell(`A${nextChartTopRow}`).font = { bold: true, size: 12 };
      nextChartTopRow += 1;

      const chartUrl = `https://quickchart.io/chart?width=900&height=360&format=png&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

      try {
        const response = await fetch(chartUrl);
        if (!response.ok) {
          throw new Error('Chart image request failed');
        }

        const imageBuffer = await response.arrayBuffer();
        const imageBase64 = `data:image/png;base64,${arrayBufferToBase64(imageBuffer)}`;
        const imageId = workbook.addImage({ base64: imageBase64, extension: 'png' });

        chartsSheet.addImage(imageId, {
          tl: { col: 0, row: nextChartTopRow - 1 },
          ext: { width: 900, height: 360 },
        });

        nextChartTopRow += 19;
      } catch {
        chartsSheet.getCell(`A${nextChartTopRow}`).value = 'Graph image could not be generated for this chart.';
        nextChartTopRow += 2;
      }
    };

    if (programRows.length) {
      await addChartImage('Program Employment (Bar Chart)', {
        type: 'bar',
        data: {
          labels: programRows.map((row) => row['Program Code']),
          datasets: [
            {
              label: 'Employed',
              backgroundColor: '#22c55e',
              data: programRows.map((row) => row['Employed']),
            },
            {
              label: 'Aligned',
              backgroundColor: '#3b82f6',
              data: programRows.map((row) => row['Aligned']),
            },
          ],
        },
        options: {
          title: { display: true, text: 'Program Employment and Alignment' },
          legend: { position: 'bottom' },
        },
      });
    }

    if (yearRows.length) {
      await addChartImage('Yearly Employment Trend (Line Chart)', {
        type: 'line',
        data: {
          labels: yearRows.map((row) => row['Year Graduated']),
          datasets: [
            {
              label: 'Employment Rate %',
              borderColor: '#22c55e',
              fill: false,
              data: yearRows.map((row) => row['Employment Rate (%)']),
            },
            {
              label: 'Alignment Rate %',
              borderColor: '#f59e0b',
              fill: false,
              data: yearRows.map((row) => row['Alignment Rate (%)']),
            },
          ],
        },
        options: {
          title: { display: true, text: 'Employment and Alignment Trend by Year' },
          legend: { position: 'bottom' },
        },
      });
    }

    if (statusRows.length) {
      await addChartImage('Employment Status Breakdown (Pie Chart)', {
        type: 'pie',
        data: {
          labels: statusRows.map((row) => row['Employment Status']),
          datasets: [
            {
              backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280'],
              data: statusRows.map((row) => row.Count),
            },
          ],
        },
        options: {
          title: { display: true, text: 'Employment Status Distribution' },
          legend: { position: 'right' },
        },
      });
    }

    if (salaryRows.length) {
      await addChartImage('Salary Distribution (Bar Chart)', {
        type: 'bar',
        data: {
          labels: salaryRows.map((row) => row['Salary Range']),
          datasets: [
            {
              label: 'Count',
              backgroundColor: '#6366f1',
              data: salaryRows.map((row) => row.Count),
            },
          ],
        },
        options: {
          title: { display: true, text: 'Salary Distribution' },
          legend: { display: false },
        },
      });
    }

    const yearSuffix = selectedYear !== 'all' ? `_${selectedYear}` : '_all_years';
    const fileDate = new Date().toISOString().slice(0, 10);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gradtrack_detailed_report${yearSuffix}_${fileDate}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleExportPdf = async () => {
    if (tab === 'surveys') {
      return;
    }

    const pdf = new jsPDF('p', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginLeft = 40;

    const fetchReportData = async <T,>(
      type: string,
      year: string,
    ): Promise<T | null> => {
      try {
        const response = await fetch(buildReportUrl(type, year));
        const result = await response.json();
        return result.success ? (result.data as T) : null;
      } catch {
        return null;
      }
    };

    const [overviewPdf, programPdf, yearPdf, statusPdf, salaryPdf] = await Promise.all([
      fetchReportData<Overview>('overview', selectedYear),
      fetchReportData<ProgramReport[]>('by_program', selectedYear),
      fetchReportData<YearReport[]>('by_year', selectedYear),
      fetchReportData<StatusData[]>('employment_status', selectedYear),
      fetchReportData<SalaryData[]>('salary_distribution', selectedYear),
    ]);

    const overviewForPdf = overviewPdf ?? overview;
    const programForPdf = programPdf ?? programData;
    const yearForPdf = yearPdf ?? yearData;
    const statusForPdf = statusPdf ?? statusData;
    const salaryForPdf = salaryPdf ?? salaryData;

    const sectionDescriptions = buildPdfSectionDescriptions(
      overviewForPdf,
      programForPdf,
      yearForPdf,
      statusForPdf,
      salaryForPdf,
      selectedDepartment,
      selectedYear,
    );

    pdf.setFillColor(27, 42, 74);
    pdf.rect(0, 0, pageWidth, 110, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.text('Graduate Tracer Study Report', marginLeft, 52);
    pdf.setFontSize(13);
    pdf.text('Norzagaray College', marginLeft, 76);

    pdf.setTextColor(30, 30, 30);
    pdf.setFontSize(11);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, marginLeft, 144);
    pdf.text(`Department: ${selectedDepartment === 'all' ? 'All Departments' : selectedDepartment}`, marginLeft, 162);
    pdf.text(`Year Scope: ${selectedYear === 'all' ? 'All Years' : selectedYear}`, marginLeft, 180);
    pdf.setFontSize(11);
    const coverDescription = pdf.splitTextToSize(sectionDescriptions.cover, pageWidth - 80);
    pdf.text(coverDescription, marginLeft, 204);

    if (overviewForPdf) {
      autoTable(pdf, {
        startY: 248,
        head: [['Key Performance Indicator', 'Value']],
        body: [
          ['Total Graduates', overviewForPdf.total_graduates],
          ['Total Employed', overviewForPdf.total_employed],
          ['Employed (Local)', overviewForPdf.total_employed_local],
          ['Employed (Abroad)', overviewForPdf.total_employed_abroad],
          ['Total Aligned', overviewForPdf.total_aligned],
          ['Employment Rate (%)', overviewForPdf.employment_rate],
          ['Alignment Rate (%)', overviewForPdf.alignment_rate],
        ],
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [27, 42, 74] },
      });
    }

    const aiSummaryLines: string[] = [];
    try {
      if (aiAnalysis && aiAnalysis.trim()) {
        aiSummaryLines.push(...aiAnalysis.trim().split('\n').filter((line) => line.trim() !== ''));
      } else {
        const aiResponse = await fetch(`${API_BASE}/reports/ai-analytics.php`);
        const aiResult = await aiResponse.json();
        if (aiResult.success && aiResult.data?.ai_analysis) {
          aiSummaryLines.push(...String(aiResult.data.ai_analysis).split('\n').filter((line: string) => line.trim() !== ''));
        }
      }
    } catch {
      // AI summary is optional in PDF.
    }

    if (aiSummaryLines.length > 0) {
      pdf.addPage();
      pdf.setFontSize(16);
      pdf.text('Executive Insights', marginLeft, 48);
      pdf.setFontSize(10);
      const executiveDescription = pdf.splitTextToSize(sectionDescriptions.executive, pageWidth - 80);
      pdf.text(executiveDescription, marginLeft, 70);
      const wrapped = pdf.splitTextToSize(aiSummaryLines.join(' '), pageWidth - 80);
      pdf.text(wrapped, marginLeft, 108);
    }

    const addSection = async (
      sectionTitle: string,
      sectionTab: 'overview' | 'program' | 'year' | 'employment' | 'salary',
    ) => {
      const tableData = getPdfTableForTab(
        sectionTab,
        overviewForPdf,
        programForPdf,
        yearForPdf,
        statusForPdf,
        salaryForPdf,
      );

      if (!tableData.rows.length) {
        return;
      }

      const chartConfig = getPdfChartConfig(
        sectionTab,
        overviewForPdf,
        programForPdf,
        yearForPdf,
        statusForPdf,
        salaryForPdf,
      );

      const sectionDescriptionText = sectionTab === 'overview'
        ? sectionDescriptions.overview
        : sectionTab === 'program'
        ? sectionDescriptions.program
        : sectionTab === 'year'
        ? sectionDescriptions.year
        : sectionTab === 'employment'
        ? sectionDescriptions.employment
        : sectionDescriptions.salary;

      const drawSectionHeader = () => {
        pdf.setFontSize(15);
        pdf.setTextColor(30, 30, 30);
        pdf.text(sectionTitle, marginLeft, 42);
        pdf.setFontSize(9);
        pdf.text(
          `Department: ${selectedDepartment === 'all' ? 'All Departments' : selectedDepartment} | Year: ${selectedYear === 'all' ? 'All Years' : selectedYear}`,
          marginLeft,
          58,
        );
        pdf.setFontSize(10);
        pdf.setTextColor(27, 42, 74);
        pdf.text('Descriptive Summary', marginLeft, 76);
        pdf.setTextColor(35, 35, 35);
        const wrappedDescription = pdf.splitTextToSize(sectionDescriptionText, pageWidth - 80);
        pdf.text(wrappedDescription, marginLeft, 92);
      };

      pdf.addPage();
      drawSectionHeader();

      let tableStartY = 138;

      if (chartConfig) {
        const chartUrl = `https://quickchart.io/chart?width=1000&height=380&format=png&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
        try {
          const response = await fetch(chartUrl);
          if (response.ok) {
            const imageBuffer = await response.arrayBuffer();
            const imageBase64 = `data:image/png;base64,${arrayBufferToBase64(imageBuffer)}`;
            pdf.addImage(imageBase64, 'PNG', marginLeft, 128, pageWidth - 80, 220);
            tableStartY = 366;
          }
        } catch {
          tableStartY = 160;
        }
      }

      autoTable(pdf, {
        startY: tableStartY,
        head: [tableData.headers],
        body: tableData.rows,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [27, 42, 74] },
        margin: { left: marginLeft, right: marginLeft, bottom: 24 },
        didDrawPage: () => {
          drawSectionHeader();
        },
      });
    };

    await addSection('Overview Analytics', 'overview');
    await addSection('Program Performance', 'program');
    await addSection('Yearly Employment Trend', 'year');
    await addSection('Employment Status Analysis', 'employment');
    await addSection('Salary Distribution Analysis', 'salary');

    const pageCount = (pdf as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 90, pageHeight - 16);
      pdf.text('GradTrack - Confidential Department Report', marginLeft, pageHeight - 16);
    }

    const yearSuffix = selectedYear !== 'all' ? `_${selectedYear}` : '_all_years';
    const departmentSuffix = selectedDepartment !== 'all' ? `_${selectedDepartment}` : '_all_departments';
    const fileDate = new Date().toISOString().slice(0, 10);
    pdf.save(`gradtrack_formal_report${departmentSuffix}${yearSuffix}_${fileDate}.pdf`);
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'program', label: 'By Program' },
    { key: 'year', label: 'By Year' },
    { key: 'employment', label: 'Employment Status' },
    { key: 'salary', label: 'Salary Distribution' },
    { key: 'surveys', label: 'Survey Analytics' },
  ] as const;

  const renderAiAnalyticsSection = () => (
    <div className="border-2 border-purple-200 rounded-xl p-6 bg-gradient-to-br from-purple-50 via-blue-50 to-white shadow-lg">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-md">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-bold text-[#1b2a4a]">AI-Powered Descriptive Analytics</h3>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">Powered by AI</span>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-3 py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
              <span className="text-sm text-gray-600">Generating AI insights...</span>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
              {(aiAnalysis || 'AI analysis temporarily unavailable.')
                .split('\n\n')
                .map((paragraph, idx) => (
                  <p key={idx} className="text-justify">{paragraph}</p>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const selectedSurvey = surveyItems.find((survey) => Number(survey.id) === selectedSurveyId);
  const overviewUnemployed = overview?.total_unemployed ?? Math.max((overview?.total_graduates ?? 0) - (overview?.total_employed ?? 0), 0);
  const departmentOptionMap = new Map(DEFAULT_DEPARTMENTS.map((department) => [department.code, department]));
  availableDepartments.forEach((department) => {
    if (department.code) {
      departmentOptionMap.set(department.code, department);
    }
  });
  const departmentOptions = Array.from(departmentOptionMap.values());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Reports & Analytics</h1>
          <p className="text-sm text-gray-500">
            {selectedSurvey ? `Viewing analytics for ${selectedSurvey.title}` : 'Graduate employment data insights'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {tab !== 'surveys' && surveyItems.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Survey:</label>
              <select
                value={selectedSurveyId ?? ''}
                onChange={(e) => handleSelectedSurveyChange(e.target.value ? Number(e.target.value) : null)}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[240px]"
              >
                <option value="">No active survey selected</option>
                {surveyItems.map((survey) => (
                  <option key={survey.id} value={survey.id}>
                    {survey.title}
                    {survey.status === 'active' ? ' (Active)' : ' (Saved)'}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* Year Filter */}
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
          {tab !== 'surveys' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Department:</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Departments</option>
                {departmentOptions.map((department) => (
                  <option key={department.code} value={department.code}>
                    {department.code} - {department.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tab !== 'surveys' && (
            <>
              <button
                onClick={handleExportPdf}
                className="flex items-center gap-2 border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-4 h-4" /> Export PDF
              </button>
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" /> Export Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
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
              {/* Overview */}
              {tab === 'overview' && overview && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard icon={Users} label="Total Graduates" value={overview.total_graduates.toString()} color="bg-blue-100 text-blue-700" />
                    <StatCard icon={Briefcase} label="Employed (Total)" value={overview.total_employed.toString()} sub={`${overview.employment_rate}%`} color="bg-green-100 text-green-700" />
                    <StatCard icon={Briefcase} label="Employed (Local)" value={overview.total_employed_local.toString()} color="bg-teal-100 text-teal-700" />
                    <StatCard icon={Briefcase} label="Employed (Abroad)" value={overview.total_employed_abroad.toString()} color="bg-indigo-100 text-indigo-700" />
                    <StatCard icon={Target} label="Aligned" value={overview.total_aligned.toString()} sub={`${overview.alignment_rate}%`} color="bg-orange-100 text-orange-700" />
                  </div>

                  {/* Pie Charts Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Employment Status Pie Chart */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Employment Status</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={[
                                { name: 'Employed', value: overview.total_employed },
                                { name: 'Unemployed', value: overviewUnemployed }
                              ]} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                              <Cell fill="#22c55e" />
                              <Cell fill="#ef4444" />
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span className="text-xs text-gray-600">Employed: {overview.total_employed}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span className="text-xs text-gray-600">Unemployed: {overviewUnemployed}</span>
                        </div>
                      </div>
                    </div>

                    {/* Work Location Pie Chart */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Work Location</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={[
                                { name: 'Local', value: overview.total_employed_local },
                                { name: 'Abroad', value: overview.total_employed_abroad }
                              ]} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                              <Cell fill="#14b8a6" />
                              <Cell fill="#6366f1" />
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-teal-500" />
                          <span className="text-xs text-gray-600">Local: {overview.total_employed_local}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-indigo-500" />
                          <span className="text-xs text-gray-600">Abroad: {overview.total_employed_abroad}</span>
                        </div>
                      </div>
                    </div>

                    {/* Job Alignment Pie Chart */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Job Alignment</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={[
                                { name: 'Aligned', value: overview.total_aligned },
                                { name: 'Not Aligned', value: overview.total_employed - overview.total_aligned }
                              ]} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                              <Cell fill="#f59e0b" />
                              <Cell fill="#94a3b8" />
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-orange-500" />
                          <span className="text-xs text-gray-600">Aligned: {overview.total_aligned}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-slate-400" />
                          <span className="text-xs text-gray-600">Not Aligned: {overview.total_employed - overview.total_aligned}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Program-Based Pie Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Employment by Program */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Employment by Program</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={programData.map((p) => ({ name: p.code, value: p.employed }))} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              {programData.map((p, i) => (
                                <Cell key={i} fill={PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {programData.map((p, i) => (
                          <div key={p.code} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length] }} />
                            <span className="text-xs text-gray-600">{p.code}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Alignment by Program */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Alignment by Program</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={programData.map((p) => ({ name: p.code, value: p.aligned }))} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              {programData.map((p, i) => (
                                <Cell key={i} fill={PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {programData.map((p, i) => (
                          <div key={p.code} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length] }} />
                            <span className="text-xs text-gray-600">{p.code}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Employment Rate by Program */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Employment Rate by Program</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={programData.map((p) => ({ 
                                name: p.code, 
                                value: p.total_graduates > 0 ? Math.round((p.employed / p.total_graduates) * 100) : 0 
                              }))} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}%`}
                            >
                              {programData.map((p, i) => (
                                <Cell key={i} fill={PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${value}%`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {programData.map((p, i) => (
                          <div key={p.code} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length] }} />
                            <span className="text-xs text-gray-600">{p.code}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {renderAiAnalyticsSection()}
                </div>
              )}

              {/* By Program */}
              {tab === 'program' && (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={programData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="employed" name="Employed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="aligned" name="Aligned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="not_aligned" name="Not Aligned" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Program</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Graduates</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Employed</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Aligned</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Avg Time (mo)</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Avg Salary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {programData.map((p) => (
                          <tr key={p.code} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{p.code} — {p.name}</td>
                            <td className="px-4 py-3 text-center">{p.total_graduates}</td>
                            <td className="px-4 py-3 text-center">{p.employed}</td>
                            <td className="px-4 py-3 text-center">{p.aligned}</td>
                            <td className="px-4 py-3 text-center">{p.avg_time_to_employment ?? '—'}</td>
                            <td className="px-4 py-3 text-center">{p.avg_salary ? `₱${Number(p.avg_salary).toLocaleString()}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {renderAiAnalyticsSection()}
                </div>
              )}

              {/* By Year */}
              {tab === 'year' && (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={yearData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year_graduated" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="total_graduates" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="employed" name="Employed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="aligned" name="Aligned" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Year</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Graduates</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Employed</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Aligned</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Avg Salary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearData.map((y) => (
                          <tr key={y.year_graduated} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{y.year_graduated}</td>
                            <td className="px-4 py-3 text-center">{y.total_graduates}</td>
                            <td className="px-4 py-3 text-center">{y.employed}</td>
                            <td className="px-4 py-3 text-center">{y.aligned}</td>
                            <td className="px-4 py-3 text-center">{y.avg_salary ? `₱${Number(y.avg_salary).toLocaleString()}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {renderAiAnalyticsSection()}
                </div>
              )}

              {/* Employment Status */}
              {tab === 'employment' && (
                <div className="space-y-6">
                  <div className="flex flex-col lg:flex-row items-center gap-8">
                    <div className="w-80 h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={statusData.map((s) => ({ name: s.employment_status, value: parseInt(String(s.count)) }))} cx="50%" cy="50%" outerRadius={120} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                            {statusData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-3">
                      {statusData.map((s, i) => (
                        <div key={s.employment_status} className="flex items-center justify-between border rounded-lg p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-sm font-medium">{s.employment_status}</span>
                          </div>
                          <span className="text-lg font-bold text-[#1b2a4a]">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Separate Analytics for Local and Overseas */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                    {/* Local Employment Analytics */}
                    <div className="border-2 border-teal-200 rounded-xl p-6 bg-teal-50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-teal-500 rounded-lg">
                          <Briefcase className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-teal-900">Local Employment</h3>
                          <p className="text-sm text-teal-700">Graduates working in the Philippines</p>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Total Employed Locally</span>
                          <span className="text-2xl font-bold text-teal-900">
                            {statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-sm text-gray-600">Percentage of Total Employed</span>
                          <span className="text-xl font-bold text-teal-700">
                            {(() => {
                              const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                              const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                              const totalEmployed = localCount + abroadCount;
                              return totalEmployed > 0 ? Math.round((localCount / totalEmployed) * 100) : 0;
                            })()}%
                          </span>
                        </div>
                        <div className="pt-3 border-t">
                          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${(() => {
                                  const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                                  const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                                  const totalEmployed = localCount + abroadCount;
                                  return totalEmployed > 0 ? Math.round((localCount / totalEmployed) * 100) : 0;
                                })()}%` 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Overseas Employment Analytics */}
                    <div className="border-2 border-indigo-200 rounded-xl p-6 bg-indigo-50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-indigo-500 rounded-lg">
                          <Briefcase className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-indigo-900">Overseas Employment</h3>
                          <p className="text-sm text-indigo-700">Graduates working abroad</p>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Total Employed Abroad</span>
                          <span className="text-2xl font-bold text-indigo-900">
                            {statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-sm text-gray-600">Percentage of Total Employed</span>
                          <span className="text-xl font-bold text-indigo-700">
                            {(() => {
                              const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                              const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                              const totalEmployed = localCount + abroadCount;
                              return totalEmployed > 0 ? Math.round((abroadCount / totalEmployed) * 100) : 0;
                            })()}%
                          </span>
                        </div>
                        <div className="pt-3 border-t">
                          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${(() => {
                                  const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                                  const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                                  const totalEmployed = localCount + abroadCount;
                                  return totalEmployed > 0 ? Math.round((abroadCount / totalEmployed) * 100) : 0;
                                })()}%` 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Statistics */}
                  <div className="border rounded-xl p-6 bg-gray-50">
                    <h3 className="text-lg font-bold text-[#1b2a4a] mb-4">Employment Distribution Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600 mb-2">Total Employed</p>
                        <p className="text-3xl font-bold text-green-600">
                          {(() => {
                            const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                            const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                            return localCount + abroadCount;
                          })()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600 mb-2">Local vs Abroad Ratio</p>
                        <p className="text-xl font-bold text-[#1b2a4a]">
                          {(() => {
                            const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                            const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                            return `${localCount} : ${abroadCount}`;
                          })()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600 mb-2">Unemployed</p>
                        <p className="text-3xl font-bold text-red-600">
                          {statusData.find(s => s.employment_status === 'Unemployed')?.count || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  {renderAiAnalyticsSection()}
                </div>
              )}

              {/* Salary Distribution */}
              {tab === 'salary' && (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salaryData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="salary_range" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Bar dataKey="count" name="Graduates" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {salaryData.map((s) => (
                      <div key={s.salary_range} className="border rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-[#1b2a4a]">{s.count}</p>
                        <p className="text-xs text-gray-500 mt-1">{s.salary_range}</p>
                      </div>
                    ))}
                  </div>

                  {renderAiAnalyticsSection()}
                </div>
              )}

              {/* Survey Analytics */}
              {tab === 'surveys' && (
                <div className="space-y-6">
                  {surveyLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1b2a4a]" />
                    </div>
                  ) : surveyItems.length === 0 ? (
                    <div className="border rounded-xl p-8 text-center">
                      <h3 className="text-xl font-bold text-[#1b2a4a] mb-2">Survey Analytics</h3>
                      <p className="text-gray-600">No surveys available for analytics yet.</p>
                    </div>
                  ) : (
                    <>
                      <div className="border rounded-xl p-4 bg-white">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-bold text-[#1b2a4a]">Survey Analytics</h3>
                            <p className="text-sm text-gray-500">Select a survey to view detailed analytics</p>
                          </div>
                          <select
                            value={selectedSurveyId ?? ''}
                            onChange={(e) => handleSelectedSurveyChange(e.target.value ? Number(e.target.value) : null)}
                            className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[260px]"
                          >
                            <option value="">Select a saved survey</option>
                            {surveyItems.map((survey) => (
                              <option key={survey.id} value={survey.id}>
                                {survey.title}
                                {survey.status === 'active' ? ' (Active)' : ' (Saved)'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {surveyAnalyticsLoading ? (
                        <div className="flex justify-center py-12">
                          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1b2a4a]" />
                        </div>
                      ) : !selectedSurveyId ? (
                        <div className="text-center py-12 border rounded-xl bg-white">
                          <p className="font-semibold text-[#1b2a4a]">Select a survey to load saved analytics.</p>
                          <p className="text-sm text-gray-500 mt-1">Inactive surveys keep their old responses and can still be reviewed here.</p>
                        </div>
                      ) : !surveyAnalytics ? (
                        <div className="text-center py-12 border rounded-xl bg-white">
                          <p className="text-red-500">Failed to load analytics data.</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div>
                            <h2 className="text-xl font-bold text-[#1b2a4a]">{surveyAnalytics.survey_title}</h2>
                            <p className="text-sm text-gray-500">Survey Analytics & Insights</p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <SurveyAnalyticsStatCard icon={Users} label="Total Responses" value={surveyAnalytics.total_responses.toString()} color="bg-blue-100 text-blue-700" />
                            <SurveyAnalyticsStatCard icon={TrendingUp} label="Response Rate" value={`${surveyAnalytics.response_rate}%`} color="bg-green-100 text-green-700" />
                            <SurveyAnalyticsStatCard icon={CheckCircle2} label="Completion Rate" value={`${surveyAnalytics.completion_rate}%`} color="bg-purple-100 text-purple-700" />
                            <SurveyAnalyticsStatCard icon={BarChart3} label="Questions" value={surveyAnalytics.questions_analytics.length.toString()} color="bg-orange-100 text-orange-700" />
                          </div>

                          {surveyAnalytics.employment_insights && (
                            <div className="bg-white rounded-xl shadow-sm border p-6">
                              <h3 className="text-xl font-bold text-[#1b2a4a] mb-6">Employment Insights</h3>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                <div className="border rounded-xl p-5">
                                  <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 bg-green-100 rounded-lg">
                                      <Target className="w-6 h-6 text-green-700" />
                                    </div>
                                    <div>
                                      <p className="text-sm text-gray-600">Employment Rate</p>
                                      <p className="text-3xl font-bold text-[#1b2a4a]">{surveyAnalytics.employment_insights.employment_rate}%</p>
                                    </div>
                                  </div>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Employed:</span>
                                      <span className="font-semibold">{surveyAnalytics.employment_insights.employed_count}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Unemployed:</span>
                                      <span className="font-semibold">{surveyAnalytics.employment_insights.unemployed_count}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="border rounded-xl p-5">
                                  <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 bg-blue-100 rounded-lg">
                                      <Target className="w-6 h-6 text-blue-700" />
                                    </div>
                                    <div>
                                      <p className="text-sm text-gray-600">Job Alignment Rate</p>
                                      <p className="text-3xl font-bold text-[#1b2a4a]">{surveyAnalytics.employment_insights.alignment_rate}%</p>
                                    </div>
                                  </div>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Aligned:</span>
                                      <span className="font-semibold text-green-600">{surveyAnalytics.employment_insights.aligned_count}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Partially Aligned:</span>
                                      <span className="font-semibold text-orange-600">{surveyAnalytics.employment_insights.partially_aligned_count}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Not Aligned:</span>
                                      <span className="font-semibold text-red-600">{surveyAnalytics.employment_insights.not_aligned_count}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {Object.keys(surveyAnalytics.employment_insights.salary_distribution).length > 0 && (
                                <div className="border rounded-xl p-5 mb-6">
                                  <h4 className="text-lg font-semibold text-[#1b2a4a] mb-4">Salary Distribution</h4>
                                  <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={Object.entries(surveyAnalytics.employment_insights.salary_distribution).map(([range, count]) => ({ range, count }))}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                      <XAxis dataKey="range" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={80} />
                                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                                      <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              )}

                              {Object.keys(surveyAnalytics.employment_insights.time_to_job_distribution).length > 0 && (
                                <div className="border rounded-xl p-5">
                                  <h4 className="text-lg font-semibold text-[#1b2a4a] mb-4">Time to Find First Job</h4>
                                  <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={Object.entries(surveyAnalytics.employment_insights.time_to_job_distribution).map(([time, count]) => ({ time, count }))}>
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

                          <div className="bg-white rounded-xl shadow-sm border p-6">
                            <h3 className="text-xl font-bold text-[#1b2a4a] mb-6">Question-by-Question Analysis</h3>

                            <div className="space-y-8">
                              {surveyAnalytics.questions_analytics.map((qa, index) => (
                                <div key={qa.question_id} className="border-b pb-6 last:border-b-0">
                                  <div className="mb-4">
                                    <h4 className="text-base font-semibold text-[#1b2a4a] mb-1">Q{index + 1}: {qa.question_text}</h4>
                                    <p className="text-sm text-gray-500">{qa.total_answers} responses • {qa.question_type.replace('_', ' ')}</p>
                                  </div>

                                  {(qa.question_type === 'multiple_choice' || qa.question_type === 'rating') && Array.isArray(qa.data) && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                      <div className="space-y-3">
                                        {qa.data.map((item: any, i: number) => (
                                          <div key={i} className="flex items-center gap-3">
                                            <div className="flex-1">
                                              <div className="flex justify-between text-sm mb-1">
                                                <span className="text-gray-700">{item.option}</span>
                                                <span className="font-semibold text-[#1b2a4a]">{item.count} ({item.percentage}%)</span>
                                              </div>
                                              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${item.percentage}%` }} />
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

                                  {qa.question_type === 'checkbox' && Array.isArray(qa.data) && (
                                    <div className="space-y-3">
                                      {qa.data.map((item: any, i: number) => (
                                        <div key={i} className="flex items-center gap-3">
                                          <div className="flex-1">
                                            <div className="flex justify-between text-sm mb-1">
                                              <span className="text-gray-700">{item.option}</span>
                                              <span className="font-semibold text-[#1b2a4a]">{item.count} ({item.percentage}%)</span>
                                            </div>
                                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${item.percentage}%` }} />
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {qa.question_type === 'text' && qa.data && (
                                    <div className="bg-gray-50 rounded-lg p-4">
                                      <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                                        <div>
                                          <p className="text-2xl font-bold text-[#1b2a4a]">{qa.data.total_responses}</p>
                                          <p className="text-xs text-gray-600">Responses</p>
                                        </div>
                                        <div>
                                          <p className="text-2xl font-bold text-[#1b2a4a]">{qa.data.avg_length}</p>
                                          <p className="text-xs text-gray-600">Avg. Length</p>
                                        </div>
                                        <div>
                                          <p className="text-2xl font-bold text-[#1b2a4a]">{qa.data.sample_responses?.length || 0}</p>
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
                      )}
                    </>
                  )}
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

function SurveyAnalyticsStatCard({ icon: Icon, label, value, color }: {
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
      <p className="text-3xl font-bold text-[#1b2a4a]">{value}</p>
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getPdfTableForTab(
  tab: 'overview' | 'program' | 'year' | 'employment' | 'salary' | 'surveys',
  overview: Overview | null,
  programData: ProgramReport[],
  yearData: YearReport[],
  statusData: StatusData[],
  salaryData: SalaryData[],
): { headers: string[]; rows: Array<Array<string | number>> } {
  if (tab === 'overview' && overview) {
    return {
      headers: ['Metric', 'Value'],
      rows: [
        ['Total Graduates', overview.total_graduates],
        ['Total Employed', overview.total_employed],
        ['Employed (Local)', overview.total_employed_local],
        ['Employed (Abroad)', overview.total_employed_abroad],
        ['Total Aligned', overview.total_aligned],
        ['Survey Responses', overview.total_survey_responses],
        ['Employment Rate (%)', overview.employment_rate],
        ['Alignment Rate (%)', overview.alignment_rate],
      ],
    };
  }

  if (tab === 'program') {
    return {
      headers: ['Code', 'Program', 'Graduates', 'Employed', 'Aligned', 'Partially', 'Not Aligned'],
      rows: programData.map((item) => [
        item.code,
        item.name,
        item.total_graduates,
        item.employed,
        item.aligned,
        item.partially_aligned,
        item.not_aligned,
      ]),
    };
  }

  if (tab === 'year') {
    return {
      headers: ['Year', 'Graduates', 'Employed', 'Aligned', 'Avg Salary'],
      rows: yearData.map((item) => [
        item.year_graduated,
        item.total_graduates,
        item.employed,
        item.aligned,
        item.avg_salary || 0,
      ]),
    };
  }

  if (tab === 'employment') {
    return {
      headers: ['Employment Status', 'Count'],
      rows: statusData.map((item) => [item.employment_status, item.count]),
    };
  }

  if (tab === 'salary') {
    return {
      headers: ['Salary Range', 'Count'],
      rows: salaryData.map((item) => [item.salary_range, item.count]),
    };
  }

  return { headers: [], rows: [] };
}

function getPdfChartConfig(
  tab: 'overview' | 'program' | 'year' | 'employment' | 'salary' | 'surveys',
  overview: Overview | null,
  programData: ProgramReport[],
  yearData: YearReport[],
  statusData: StatusData[],
  salaryData: SalaryData[],
): Record<string, unknown> | null {
  if (tab === 'overview' && overview) {
    const unemployed = overview.total_unemployed ?? Math.max(overview.total_graduates - overview.total_employed, 0);

    return {
      type: 'doughnut',
      data: {
        labels: ['Employed', 'Unemployed'],
        datasets: [
          {
            backgroundColor: ['#22c55e', '#ef4444'],
            data: [overview.total_employed, unemployed],
          },
        ],
      },
      options: { title: { display: true, text: 'Employment Overview' } },
    };
  }

  if (tab === 'program' && programData.length > 0) {
    return {
      type: 'bar',
      data: {
        labels: programData.map((item) => item.code),
        datasets: [
          {
            label: 'Employed',
            backgroundColor: '#22c55e',
            data: programData.map((item) => item.employed),
          },
          {
            label: 'Aligned',
            backgroundColor: '#3b82f6',
            data: programData.map((item) => item.aligned),
          },
        ],
      },
      options: { title: { display: true, text: 'Employment by Department' } },
    };
  }

  if (tab === 'year' && yearData.length > 0) {
    return {
      type: 'line',
      data: {
        labels: yearData.map((item) => item.year_graduated),
        datasets: [
          {
            label: 'Employed',
            borderColor: '#22c55e',
            fill: false,
            data: yearData.map((item) => item.employed),
          },
          {
            label: 'Aligned',
            borderColor: '#f59e0b',
            fill: false,
            data: yearData.map((item) => item.aligned),
          },
        ],
      },
      options: { title: { display: true, text: 'Yearly Trend' } },
    };
  }

  if (tab === 'employment' && statusData.length > 0) {
    return {
      type: 'pie',
      data: {
        labels: statusData.map((item) => item.employment_status),
        datasets: [
          {
            backgroundColor: ['#22c55e', '#3b82f6', '#ef4444', '#f59e0b'],
            data: statusData.map((item) => item.count),
          },
        ],
      },
      options: { title: { display: true, text: 'Employment Status Distribution' } },
    };
  }

  if (tab === 'salary' && salaryData.length > 0) {
    return {
      type: 'bar',
      data: {
        labels: salaryData.map((item) => item.salary_range),
        datasets: [
          {
            label: 'Count',
            backgroundColor: '#6366f1',
            data: salaryData.map((item) => item.count),
          },
        ],
      },
      options: { title: { display: true, text: 'Salary Distribution' } },
    };
  }

  return null;
}

function buildPdfSectionDescriptions(
  overview: Overview | null,
  programData: ProgramReport[],
  yearData: YearReport[],
  statusData: StatusData[],
  salaryData: SalaryData[],
  selectedDepartment: string,
  selectedYear: string,
): Record<'cover' | 'executive' | 'overview' | 'program' | 'year' | 'employment' | 'salary', string> {
  const departmentLabel = selectedDepartment === 'all' ? 'all departments' : `the ${selectedDepartment} department`;
  const yearLabel = selectedYear === 'all' ? 'all graduation years' : `the ${selectedYear} graduation cohort`;

  const topProgram = programData.reduce<ProgramReport | null>((best, current) => {
    if (!best) {
      return current;
    }
    return current.employed > best.employed ? current : best;
  }, null);

  const highestYear = yearData.reduce<YearReport | null>((best, current) => {
    if (!best) {
      return current;
    }
    return current.employed > best.employed ? current : best;
  }, null);

  const localCount = statusData.find((item) => item.employment_status === 'Employed (Local)')?.count ?? 0;
  const abroadCount = statusData.find((item) => item.employment_status === 'Employed (Abroad)')?.count ?? 0;
  const unemployedCount = statusData.find((item) => item.employment_status === 'Unemployed')?.count ?? 0;
  const totalSalarySamples = salaryData.reduce((sum, item) => sum + item.count, 0);
  const topSalaryRange = salaryData.reduce<SalaryData | null>((best, current) => {
    if (!best) {
      return current;
    }
    return current.count > best.count ? current : best;
  }, null);

  return {
    cover: `This formal tracer report summarizes graduate outcomes for ${departmentLabel}, covering ${yearLabel}. It consolidates participation, employability, alignment, and salary indicators so administrators can interpret workforce readiness and curriculum relevance using one coherent evidence set.`,
    executive: `The executive interpretation on this page synthesizes observed outcomes into strategic meaning. It highlights performance strengths, identifies potential intervention areas, and frames decisions that can improve graduate employability, alignment, and long-term department competitiveness.`,
    overview: overview
      ? `The overview indicates ${overview.total_graduates} traced graduates with ${overview.total_employed} employed and ${overview.total_aligned} aligned to their field. This corresponds to an employment rate of ${overview.employment_rate}% and an alignment rate of ${overview.alignment_rate}%, providing a baseline view of current department-level outcomes.`
      : `The overview section provides a consolidated snapshot of traced graduates, employed graduates, and alignment outcomes. This page should be interpreted as the baseline performance profile for the selected department and year scope.`,
    program: topProgram
      ? `Program-level comparisons show where employability outcomes are strongest within the selected scope. In this export, ${topProgram.code} records the highest employed count (${topProgram.employed}) among listed programs, helping pinpoint high-performing pathways and identify programs that may require targeted support.`
      : `Program-level comparisons in this section are used to identify which programs perform best in employment and alignment, and which programs may need curriculum enhancement or stronger employer linkage interventions.`,
    year: highestYear
      ? `Yearly trend analysis reflects changes in graduate outcomes across time. The highest employed count in this scope appears in ${highestYear.year_graduated} (${highestYear.employed} employed), allowing reviewers to assess whether employment momentum is improving, stable, or declining across cohorts.`
      : `Yearly trend analysis is presented to evaluate the direction of employability and alignment over time and to support year-specific policy and curriculum planning decisions.`,
    employment: `Employment-status analysis shows ${localCount} locally employed graduates, ${abroadCount} employed abroad, and ${unemployedCount} unemployed. This distribution clarifies labor-market absorption patterns and can guide placement strategies, industry collaboration, and graduate support programming.`,
    salary: topSalaryRange
      ? `Salary-distribution results indicate ${totalSalarySamples} recorded salary responses, with the largest concentration in '${topSalaryRange.salary_range}' (${topSalaryRange.count} graduates). This pattern helps assess economic mobility and the market value of graduate skills.`
      : `Salary-distribution analysis summarizes compensation outcomes across reported income brackets and supports evaluation of graduate earning trajectories and market alignment.`,
  };
}
