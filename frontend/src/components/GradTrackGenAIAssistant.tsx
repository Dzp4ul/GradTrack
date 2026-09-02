import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertCircle,
  Bot,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Loader2,
  MessageSquarePlus,
  Minus,
  RefreshCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import { useAuth } from '../contexts/AuthContext';

type GenAIAction = 'chat' | 'insights' | 'explain_chart' | 'generate_report';
type DownloadFormat = 'pdf' | 'xlsx' | 'csv';

interface ReportContext {
  surveyId?: number | null;
  surveyTitle?: string;
  reportType?: string;
  tab?: string;
  selectedYear?: string;
  selectedDepartment?: string;
  overviewFilters?: Record<string, unknown>;
  filterLabels?: Record<string, unknown>;
  contextLabel?: string;
  datasetHash?: string;
  chart?: Record<string, unknown> | null;
  source?: string;
}

interface SourceMetric {
  label: string;
  value: string;
  context?: string;
}

interface ReportRequest {
  isReportRequest?: boolean;
  format?: string | null;
  title?: string | null;
}

interface AssistantPayload {
  responseMode?: 'direct' | 'analysis' | 'report';
  answer: string;
  executiveSummary?: string;
  keyFindings?: string[];
  trends?: string[];
  comparisons?: string[];
  areasForAttention?: string[];
  institutionalConsiderations?: string[];
  dataLimitations?: string[];
  suggestedQuestions?: string[];
  reportRequest?: ReportRequest;
  visualizationSuggestion?: string | null;
}

interface GenAIResponseData {
  assistant: AssistantPayload;
  sourceMetrics: SourceMetric[];
  dataUsed: {
    filters?: Record<string, unknown>;
    generatedAt?: string;
    datasetHash?: string;
    model?: string | null;
    privacy?: string;
  };
  dataset?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
  aiError?: string | null;
}

interface AssistantConfig {
  roleLabel: string;
  welcome: string;
  suggestions: string[];
  supportsReportContext: boolean;
}

interface ChatMessage {
  id: string;
  role: 'admin' | 'assistant';
  content: string;
  createdAt: string;
  response?: GenAIResponseData;
  error?: string;
}

const REPORT_CONTEXT_STORAGE_KEY_PREFIX = 'gradtrack_genai_report_context';
const makeMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const toTitle = (value: unknown) => String(value ?? '')
  .replace(/_/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getReportTypeLabel = (context: ReportContext | null) => {
  const type = context?.reportType || context?.tab || 'overview';
  const map: Record<string, string> = {
    overview: 'Overview',
    by_program: 'By Program',
    program: 'By Program',
    by_year: 'By Year',
    year: 'By Year',
    employment_status: 'Employment Status',
    employment: 'Employment Status',
    salary_distribution: 'Salary Distribution',
    salary: 'Salary Distribution',
    surveys: 'Survey Analytics',
  };

  return map[String(type)] || toTitle(type);
};

const buildContextLabel = (context: ReportContext | null) => {
  if (!context) {
    return 'No report context';
  }

  if (context.contextLabel) {
    return context.contextLabel;
  }

  const filters = context.filterLabels || {};
  const program = String(filters.program || filters.course || context.selectedDepartment || 'All Programs');
  const year = String(filters.graduationYear || filters.graduation_year || context.selectedYear || 'All Years');
  return `${getReportTypeLabel(context)} - ${program} - ${year}`;
};

const safeString = (value: unknown) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const fileSafeName = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'gradtrack_genai_report';

const getFormatFromResponse = (response: GenAIResponseData): DownloadFormat => {
  const rawFormat = String(response.assistant.reportRequest?.format || '').toLowerCase();
  if (rawFormat.includes('excel') || rawFormat.includes('xlsx')) {
    return 'xlsx';
  }
  if (rawFormat.includes('csv')) {
    return 'csv';
  }
  return 'pdf';
};

const GradTrackAIMascot = ({ thinking = false, compact = false }: { thinking?: boolean; compact?: boolean }) => (
  <div className={`gt-ai-mascot ${compact ? 'gt-ai-mascot--compact' : ''} ${thinking ? 'gt-ai-mascot--thinking' : ''}`} aria-hidden="true">
    <div className="gt-ai-cap">
      <span className="gt-ai-cap__top" />
      <span className="gt-ai-cap__base" />
      <span className="gt-ai-cap__tassel" />
    </div>
    <div className="gt-ai-head">
      <div className="gt-ai-face">
        <span className="gt-ai-eye gt-ai-eye--left" />
        <span className="gt-ai-eye gt-ai-eye--right" />
        <span className="gt-ai-smile" />
      </div>
    </div>
    <div className="gt-ai-arms">
      <span className="gt-ai-arm gt-ai-arm--left" />
      <span className="gt-ai-arm gt-ai-arm--right" />
    </div>
    <div className="gt-ai-body">
      <GraduationCap className="h-4 w-4 text-blue-600" />
      <span className="gt-ai-body__dot" />
    </div>
  </div>
);

export default function GradTrackGenAIAssistant() {
  const { user } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasNewResult, setHasNewResult] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('Retrieving GradTrack data...');
  const [reportContext, setReportContext] = useState<ReportContext | null>(null);
  const [assistantConfig, setAssistantConfig] = useState<AssistantConfig | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const loadingTimersRef = useRef<number[]>([]);

  const isAdminPath = location.pathname.startsWith('/admin');
  const shouldShow = Boolean(assistantConfig) && isAdminPath;
  const reportContextStorageKey = useMemo(
    () => `${REPORT_CONTEXT_STORAGE_KEY_PREFIX}_${user?.id ?? 'anonymous'}`,
    [user?.id],
  );
  const contextLabel = useMemo(
    () => assistantConfig?.supportsReportContext
      ? buildContextLabel(reportContext)
      : `Role scope: ${assistantConfig?.roleLabel || 'GradTrack'}`,
    [assistantConfig, reportContext],
  );
  const contextIsAvailable = Boolean(
    assistantConfig?.supportsReportContext
      && (reportContext?.surveyId || reportContext?.reportType || reportContext?.tab),
  );

  const clearLoadingTimers = useCallback(() => {
    loadingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    loadingTimersRef.current = [];
  }, []);

  const startLoadingStages = useCallback((isReportRequest: boolean) => {
    clearLoadingTimers();
    const stages = isReportRequest
      ? ['Preparing report data...', 'Generating AI summary...', 'Creating report preview...']
      : ['Retrieving GradTrack data...', 'Analyzing tracer-study results...', 'Generating insights...'];
    setLoadingStage(stages[0]);
    stages.slice(1).forEach((stage, index) => {
      loadingTimersRef.current.push(window.setTimeout(() => setLoadingStage(stage), (index + 1) * 900));
    });
  }, [clearLoadingTimers]);

  const openAssistant = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setHasNewResult(false);
    window.setTimeout(() => inputRef.current?.focus(), 80);
  };

  const closeAssistant = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const resetConversation = () => {
    setMessages([]);
    setInput('');
    setHasNewResult(false);
  };

  const clearContext = () => {
    setReportContext(null);
    sessionStorage.removeItem(reportContextStorageKey);
  };

  const updateStoredContext = useCallback((context: ReportContext | null) => {
    if (!assistantConfig?.supportsReportContext) {
      return;
    }
    setReportContext(context);
    if (context) {
      sessionStorage.setItem(reportContextStorageKey, JSON.stringify(context));
    }
  }, [assistantConfig?.supportsReportContext, reportContextStorageKey]);

  useEffect(() => {
    setAssistantConfig(null);
    setMessages([]);
    setReportContext(null);

    if (!user?.id || !isAdminPath) {
      setAssistantConfig(null);
      return;
    }

    const controller = new AbortController();
    fetch(API_ENDPOINTS.GENAI_ASSISTANT, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success || !result.data?.assistantConfig) {
          return null;
        }
        return result.data.assistantConfig as AssistantConfig;
      })
      .then((config) => {
        if (!controller.signal.aborted) {
          setAssistantConfig(config);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAssistantConfig(null);
        }
      });

    return () => controller.abort();
  }, [isAdminPath, user?.id, user?.role]);

  const sendMessage = useCallback(async (prompt?: string, action: GenAIAction = 'chat', explicitContext?: ReportContext) => {
    const messageText = (prompt ?? input).trim();
    if (!messageText || loading) {
      return;
    }

    const activeContext = explicitContext ?? reportContext;
    const userMessage: ChatMessage = {
      id: makeMessageId(),
      role: 'admin',
      content: messageText,
      createdAt: new Date().toISOString(),
    };

    const conversation = [...messages, userMessage]
      .slice(-8)
      .map((message) => ({
        role: message.role === 'admin' ? 'user' : 'assistant',
        content: message.content,
      }));

    setMessages((current) => [...current, userMessage]);
    setInput('');
    setLoading(true);
    startLoadingStages(action === 'generate_report' || /\b(report|pdf|excel|xlsx|csv|download|export)\b/i.test(messageText));

    try {
      const response = await fetch(API_ENDPOINTS.GENAI_ASSISTANT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          message: messageText,
          report_context: activeContext,
          conversation,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'GradTrack GenAI is temporarily unavailable.');
      }

      const data = result.data as GenAIResponseData;
      const assistantMessage: ChatMessage = {
        id: makeMessageId(),
        role: 'assistant',
        content: data.assistant.answer,
        createdAt: new Date().toISOString(),
        response: data,
      };

      setMessages((current) => [...current, assistantMessage]);
      if (data.context) {
        updateStoredContext({
          ...(activeContext || {}),
          surveyId: Number(data.context.surveyId || activeContext?.surveyId || 0) || activeContext?.surveyId || null,
          reportType: String(data.context.reportType || activeContext?.reportType || 'overview'),
          selectedDepartment: data.context.department ? String(data.context.department) : activeContext?.selectedDepartment,
          selectedYear: data.context.year ? String(data.context.year) : activeContext?.selectedYear,
          overviewFilters: (data.context.overviewFilters as Record<string, unknown>) || activeContext?.overviewFilters,
          datasetHash: data.dataUsed?.datasetHash,
          contextLabel,
        });
      }

      if (!isOpen || isMinimized) {
        setHasNewResult(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GradTrack GenAI is temporarily unavailable.';
      setMessages((current) => [
        ...current,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: 'GradTrack GenAI is temporarily unavailable. Your report data has not been affected. Please try again.',
          createdAt: new Date().toISOString(),
          error: message,
        },
      ]);
    } finally {
      clearLoadingTimers();
      setLoading(false);
      setLoadingStage('Retrieving GradTrack data...');
    }
  }, [clearLoadingTimers, contextLabel, input, isMinimized, isOpen, loading, messages, reportContext, startLoadingStages, updateStoredContext]);

  const copyMessage = async (message: ChatMessage) => {
    const details = message.response
      ? [
          message.content,
          ...(message.response.assistant.keyFindings || []),
          ...(message.response.assistant.areasForAttention || []),
        ].join('\n')
      : message.content;

    await navigator.clipboard?.writeText(details);
  };

  const buildReportTitle = (response: GenAIResponseData) => (
    response.assistant.reportRequest?.title || 'GradTrack GenAI Tracer Report'
  );

  const downloadPdf = (response: GenAIResponseData) => {
    const pdf = new jsPDF('p', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 42;
    let y = 54;

    const title = buildReportTitle(response);
    const addPageIfNeeded = (needed = 80) => {
      if (y + needed > pageHeight - 48) {
        pdf.addPage();
        y = 52;
      }
    };
    const addWrappedText = (text: string, size = 10, color: [number, number, number] = [35, 35, 35]) => {
      if (!text.trim()) {
        return;
      }
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      const lines = pdf.splitTextToSize(text, pageWidth - margin * 2);
      addPageIfNeeded(lines.length * 12 + 8);
      pdf.text(lines, margin, y);
      y += lines.length * 12 + 12;
    };
    const addSection = (sectionTitle: string, value?: string | string[]) => {
      const lines = Array.isArray(value) ? value.filter(Boolean).join('\n') : (value || '');
      if (!lines.trim()) {
        return;
      }
      addPageIfNeeded(56);
      pdf.setFontSize(12);
      pdf.setTextColor(27, 42, 74);
      pdf.text(sectionTitle, margin, y);
      y += 16;
      addWrappedText(lines, 10);
    };

    pdf.setFillColor(27, 42, 74);
    pdf.rect(0, 0, pageWidth, 96, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18);
    pdf.text('Norzagaray College', margin, 42);
    pdf.setFontSize(13);
    pdf.text('GradTrack Graduate Tracer Study', margin, 66);

    y = 126;
    pdf.setTextColor(27, 42, 74);
    pdf.setFontSize(16);
    pdf.text(title, margin, y);
    y += 24;
    addWrappedText(`Generated by GradTrack GenAI Assistant on ${new Date().toLocaleString()}`, 10, [75, 85, 99]);

    if (response.dataUsed?.filters) {
      autoTable(pdf, {
        startY: y,
        head: [['Report Filter', 'Value']],
        body: Object.entries(response.dataUsed.filters).map(([key, value]) => [toTitle(key), safeString(value)]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [27, 42, 74] },
      });
      y = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;
    }

    addSection('Executive Summary', response.assistant.executiveSummary || response.assistant.answer);
    addSection('Key Findings', response.assistant.keyFindings);
    addSection('Interpretation of Results', response.assistant.answer);
    addSection('Important Trends', response.assistant.trends);
    addSection('Comparisons', response.assistant.comparisons);
    addSection('Areas for Attention', response.assistant.areasForAttention);
    addSection('Institutional Considerations', response.assistant.institutionalConsiderations);
    addSection('Data Limitations', response.assistant.dataLimitations);

    if (response.sourceMetrics.length > 0) {
      addPageIfNeeded(120);
      autoTable(pdf, {
        startY: y,
        head: [['Supporting Data', 'Value', 'Context']],
        body: response.sourceMetrics.map((metric) => [metric.label, metric.value, metric.context || '']),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [27, 42, 74] },
      });
      y = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;
    }

    addWrappedText(
      'AI-generated insights are based on the GradTrack data included in this report and are intended to assist interpretation. Findings should be reviewed together with the underlying tracer-study data.',
      8,
      [88, 88, 88],
    );

    const pageCount = (pdf as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 92, pageHeight - 18);
      pdf.text('Generated by GradTrack GenAI Assistant', margin, pageHeight - 18);
    }

    pdf.save(`${fileSafeName(title)}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const downloadCsv = (response: GenAIResponseData) => {
    const rows: string[][] = [
      ['GradTrack GenAI Report', buildReportTitle(response)],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Section', 'Value'],
      ['Executive Summary', response.assistant.executiveSummary || response.assistant.answer],
      ...((response.assistant.keyFindings || []).map((item) => ['Key Finding', item])),
      ...((response.assistant.trends || []).map((item) => ['Trend', item])),
      ...((response.assistant.areasForAttention || []).map((item) => ['Area for Attention', item])),
      [],
      ['Supporting Data', 'Value', 'Context'],
      ...response.sourceMetrics.map((metric) => [metric.label, metric.value, metric.context || '']),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${fileSafeName(buildReportTitle(response))}.csv`);
  };

  const downloadXlsx = async (response: GenAIResponseData) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GradTrack GenAI Assistant';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('GenAI Summary');
    summary.addRows([
      ['GradTrack GenAI Report', buildReportTitle(response)],
      ['Generated', new Date().toLocaleString()],
      ['Model', response.dataUsed?.model || 'Not available'],
      ['Dataset Hash', response.dataUsed?.datasetHash || 'Not available'],
      [],
      ['Executive Summary'],
      [response.assistant.executiveSummary || response.assistant.answer],
      [],
      ['Key Findings'],
      ...((response.assistant.keyFindings || []).map((item) => [item])),
      [],
      ['Areas for Attention'],
      ...((response.assistant.areasForAttention || []).map((item) => [item])),
    ]);
    summary.getColumn(1).width = 36;
    summary.getColumn(2).width = 48;

    const metrics = workbook.addWorksheet('Supporting Data');
    metrics.columns = [
      { header: 'Metric', key: 'label', width: 32 },
      { header: 'Value', key: 'value', width: 28 },
      { header: 'Context', key: 'context', width: 64 },
    ];
    response.sourceMetrics.forEach((metric) => metrics.addRow(metric));

    const dataset = response.dataset || {};
    Object.entries(dataset).forEach(([key, value]) => {
      if (!Array.isArray(value) || value.length === 0 || typeof value[0] !== 'object') {
        return;
      }
      const sheet = workbook.addWorksheet(toTitle(key).slice(0, 31));
      const rows = value as Array<Record<string, unknown>>;
      const headers = Object.keys(rows[0]);
      sheet.columns = headers.map((header) => ({
        header: toTitle(header),
        key: header,
        width: Math.max(14, Math.min(36, header.length + 8)),
      }));
      rows.forEach((row) => sheet.addRow(row));
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${fileSafeName(buildReportTitle(response))}.xlsx`,
    );
  };

  const downloadReport = async (response: GenAIResponseData, format: DownloadFormat = getFormatFromResponse(response)) => {
    if (format === 'xlsx') {
      await downloadXlsx(response);
      return;
    }
    if (format === 'csv') {
      downloadCsv(response);
      return;
    }
    downloadPdf(response);
  };

  useEffect(() => {
    if (!assistantConfig?.supportsReportContext) {
      setReportContext(null);
      return;
    }
    const storedContext = sessionStorage.getItem(reportContextStorageKey);
    if (storedContext) {
      try {
        setReportContext(JSON.parse(storedContext) as ReportContext);
      } catch {
        sessionStorage.removeItem(reportContextStorageKey);
      }
    }
  }, [assistantConfig?.supportsReportContext, reportContextStorageKey]);

  useEffect(() => {
    const handleContextUpdate = (event: Event) => {
      if (!assistantConfig?.supportsReportContext) {
        return;
      }
      const detail = (event as CustomEvent<ReportContext>).detail;
      if (detail) {
        updateStoredContext(detail);
      }
    };

    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; action?: GenAIAction; context?: ReportContext }>).detail || {};
      const nextContext = detail.context || reportContext;
      if (detail.context) {
        updateStoredContext(detail.context);
      }
      setIsOpen(true);
      setIsMinimized(false);
      setHasNewResult(false);
      if (detail.prompt) {
        window.setTimeout(() => {
          void sendMessage(detail.prompt, detail.action || 'chat', nextContext || undefined);
        }, 80);
      }
    };

    window.addEventListener('gradtrack:report-context', handleContextUpdate as EventListener);
    window.addEventListener('gradtrack:genai-open', handleOpen as EventListener);
    return () => {
      window.removeEventListener('gradtrack:report-context', handleContextUpdate as EventListener);
      window.removeEventListener('gradtrack:genai-open', handleOpen as EventListener);
    };
  }, [assistantConfig?.supportsReportContext, reportContext, sendMessage, updateStoredContext]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsMinimized(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => () => clearLoadingTimers(), [clearLoadingTimers]);

  if (!shouldShow) {
    return null;
  }

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;

  const renderAssistantSections = (message: ChatMessage) => {
    const response = message.response;
    const assistant = response?.assistant;

    if (!assistant) {
      return (
        <div className="space-y-2">
          <p>{message.content}</p>
          {message.error && (
            <div className="gt-ai-error mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{message.error}</span>
            </div>
          )}
        </div>
      );
    }

    const sections = [
      { title: 'Executive Summary', items: assistant.executiveSummary ? [assistant.executiveSummary] : [] },
      { title: 'Key Findings', items: assistant.keyFindings || [] },
      { title: 'Trends', items: assistant.trends || [] },
      { title: 'Comparisons', items: assistant.comparisons || [] },
      { title: 'Areas for Attention', items: assistant.areasForAttention || [] },
      { title: 'Institutional Considerations', items: assistant.institutionalConsiderations || [] },
      { title: 'Data Limitations', items: assistant.dataLimitations || [] },
    ].filter((section) => section.items.length > 0);

    const reportReady = assistant.reportRequest?.isReportRequest && response.dataset;
    const preferredFormat = getFormatFromResponse(response);
    const isDirect = assistant.responseMode === 'direct';

    return (
      <div className="space-y-4">
        <p className="whitespace-pre-wrap">{assistant.answer}</p>

        {isDirect && response.sourceMetrics.length > 0 && (
          <div className="gt-ai-data-summary rounded-md border px-3 py-2 text-[11px] leading-relaxed">
            <span className="font-semibold">Data used:</span>{' '}
            {response.sourceMetrics.map((metric, index) => (
              <span key={metric.label}>
                {index > 0 ? ' | ' : ''}
                <span className="font-semibold">{metric.label}</span>: {metric.value}
              </span>
            ))}
          </div>
        )}

        {!isDirect && sections.map((section) => (
          <section key={section.title} className="gt-ai-section rounded-lg border p-3">
            <h4 className="gt-ai-primary-text mb-2 text-xs font-bold uppercase tracking-wide">{section.title}</h4>
            <div className="gt-ai-secondary-text space-y-2 text-sm">
              {section.items.map((item, index) => (
                <p key={index} className="leading-relaxed">{item}</p>
              ))}
            </div>
          </section>
        ))}

        {!isDirect && response.sourceMetrics.length > 0 && (
          <section className="gt-ai-data-section rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide">Data Used For This Analysis</h4>
            <div className="space-y-2">
              {response.sourceMetrics.map((metric) => (
                <div key={metric.label} className="text-xs">
                  <span className="font-semibold">{metric.label}:</span> {metric.value}
                </div>
              ))}
            </div>
            <p className="gt-ai-muted-text mt-2 text-[11px] leading-relaxed">
              Generated {response.dataUsed.generatedAt ? new Date(response.dataUsed.generatedAt).toLocaleString() : 'now'}
              {response.dataUsed.model ? ` using ${response.dataUsed.model}` : ''}. {response.dataUsed.privacy}
            </p>
          </section>
        )}

        {reportReady && (
          <div className="gt-ai-report-ready rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <div className="gt-ai-report-icon rounded-lg p-2 text-emerald-700 shadow-sm">
                {preferredFormat === 'xlsx' ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-emerald-950">{buildReportTitle(response)}</p>
                <p className="text-xs text-emerald-700">{preferredFormat.toUpperCase()} - Generated by GradTrack GenAI</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadReport(response, preferredFormat)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadReport(response, 'pdf')}
                    className="gt-ai-report-secondary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadReport(response, 'xlsx')}
                    className="gt-ai-report-secondary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadReport(response, 'csv')}
                    className="gt-ai-report-secondary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
                  >
                    CSV
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {response.aiError && (
          <div className="gt-ai-warning rounded-lg border px-3 py-2 text-xs">
            Local deterministic analysis was used because Groq was unavailable: {response.aiError}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {isOpen && !isMinimized && (
        <div className="fixed inset-x-3 bottom-3 z-[70] sm:inset-x-auto sm:right-5 sm:w-[430px]">
          <section
            className="gt-ai-chat-panel flex max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
            aria-label="GradTrack GenAI Assistant chat panel"
          >
            <header className="flex items-center gap-3 border-b bg-[#1b2a4a] px-4 py-3 text-white">
              <div className="relative shrink-0">
                <GradTrackAIMascot compact thinking={loading} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-bold">GradTrack GenAI Assistant</h2>
                <p className="truncate text-xs text-blue-100">{assistantConfig?.roleLabel} Assistant</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={resetConversation}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-blue-100 hover:bg-white/10"
                  aria-label="New conversation"
                  title="New conversation"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-blue-100 hover:bg-white/10"
                  aria-label="Minimize GradTrack GenAI"
                  title="Minimize"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={closeAssistant}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-blue-100 hover:bg-white/10"
                  aria-label="Close GradTrack GenAI"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="gt-ai-status-bar border-b px-4 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`gt-ai-ready-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${loading ? 'is-analyzing' : ''}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'}`} />
                  {loading ? 'Analyzing' : 'Ready'}
                </span>
                <span className="gt-ai-context-badge min-w-0 flex-1 truncate rounded-full border px-2.5 py-1 font-medium">
                  Analyzing: {contextLabel}
                </span>
                {contextIsAvailable && (
                  <button type="button" onClick={clearContext} className="gt-ai-muted-button font-semibold">
                    Clear context
                  </button>
                )}
              </div>
            </div>

            <div className="gt-ai-messages min-h-[240px] flex-1 overflow-y-auto px-4 py-4 sm:min-h-[360px]">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="gt-ai-card rounded-2xl border p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-3">
                      <GradTrackAIMascot compact />
                      <div>
                        <p className="gt-ai-primary-text font-bold">Hello! I'm the GradTrack GenAI Assistant.</p>
                        <p className="gt-ai-muted-text text-xs font-medium">Assistance scoped to your authenticated {assistantConfig?.roleLabel} account.</p>
                      </div>
                    </div>
                    <p className="gt-ai-secondary-text text-sm leading-relaxed">
                      {assistantConfig?.welcome}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(assistantConfig?.suggestions || []).map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt, prompt.toLowerCase().includes('report') || prompt.toLowerCase().includes('pdf') ? 'generate_report' : 'chat')}
                        className="gt-ai-suggestion rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {messages.map((message) => (
                  <article key={message.id} className={`flex ${message.role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      message.role === 'admin'
                        ? 'bg-[#1d4ed8] text-white'
                        : 'gt-ai-assistant-message border'
                    }`}>
                      {message.role === 'assistant' ? renderAssistantSections(message) : <p className="whitespace-pre-wrap">{message.content}</p>}
                      {message.role === 'assistant' && (
                        <div className="gt-ai-message-meta mt-3 flex items-center justify-between gap-2 border-t pt-2 text-[11px]">
                          <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <button
                            type="button"
                            onClick={() => void copyMessage(message)}
                            className="gt-ai-copy-button inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold"
                          >
                            <Copy className="h-3 w-3" />
                            Copy
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="gt-ai-assistant-message max-w-[88%] rounded-2xl border px-4 py-3 text-sm shadow-sm">
                      <div className="flex items-center gap-3">
                        <GradTrackAIMascot compact thinking />
                        <div>
                          <p className="gt-ai-primary-text font-semibold">{loadingStage}</p>
                          <p className="gt-ai-muted-text text-xs">GradTrack AI is typing...</p>
                        </div>
                        <Loader2 className="ml-auto h-4 w-4 animate-spin text-blue-600" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {lastMessage?.response?.assistant.suggestedQuestions?.length ? (
              <div className="gt-ai-followups border-t px-4 py-2">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {lastMessage.response.assistant.suggestedQuestions?.map((question: string) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void sendMessage(question, question.toLowerCase().includes('report') || question.toLowerCase().includes('export') ? 'generate_report' : 'chat')}
                      className="gt-ai-suggestion shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <footer className="gt-ai-footer border-t p-3">
              <div className="gt-ai-input-wrap flex items-end gap-2 rounded-xl border p-2">
                {assistantConfig?.supportsReportContext && (
                  <button
                    type="button"
                    onClick={() => void sendMessage('Generate comprehensive insights from the current report.', 'insights')}
                    className="gt-ai-insights-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    aria-label="Generate insights for current report"
                    title="Generate insights for current report"
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={1}
                  className="gt-ai-input max-h-28 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm outline-none focus:ring-0"
                  placeholder="Ask about GradTrack features available to your account..."
                  aria-label="Message GradTrack GenAI Assistant"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={loading || input.trim() === ''}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1d4ed8] text-white hover:bg-[#1e40af] disabled:cursor-not-allowed disabled:bg-slate-300"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-5 right-5 z-[70]">
          <button
            type="button"
            onClick={openAssistant}
            className={`gt-ai-floating-button group relative flex h-[78px] w-[78px] items-center justify-center rounded-full border shadow-2xl ${
              hasNewResult ? 'gt-ai-floating-button--new' : ''
            }`}
            aria-label="Ask GradTrack AI"
          >
            <GradTrackAIMascot thinking={loading} />
            <span className="pointer-events-none absolute bottom-full right-0 mb-2 hidden whitespace-nowrap rounded-lg bg-[#1b2a4a] px-3 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block">
              Ask GradTrack AI
            </span>
            {hasNewResult && <span className="gt-ai-new-dot absolute right-2 top-2 h-3 w-3 rounded-full bg-emerald-500 ring-4" />}
          </button>
        </div>
      )}

      {!isOpen && (
        <button
          type="button"
          onClick={openAssistant}
          className="sr-only"
          aria-label="Open GradTrack GenAI Assistant"
        >
          <Bot className="h-4 w-4" />
          Open GradTrack GenAI Assistant
        </button>
      )}

      {isOpen && isMinimized && (
        <button
          type="button"
          onClick={openAssistant}
          className="fixed bottom-24 right-6 z-[70] inline-flex items-center gap-2 rounded-full bg-[#1b2a4a] px-3 py-2 text-xs font-semibold text-white shadow-lg"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Continue chat
        </button>
      )}
    </>
  );
}
