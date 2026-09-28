import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  ListFilter,
  Loader2,
  MessageSquarePlus,
  Minus,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
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

interface PresentationStat {
  label: string;
  value: string;
  tone?: 'primary' | 'positive' | 'warning' | 'danger' | 'neutral';
}

interface PresentationRecord {
  title: string;
  details?: Array<{ label: string; value: string }>;
  status?: string;
  tone?: PresentationStat['tone'];
}

interface ResponsePresentation {
  kind: 'text' | 'statistics' | 'list' | 'comparison' | 'instructions' | 'navigation' | 'empty' | 'error';
  title?: string;
  summary?: string;
  stats?: PresentationStat[];
  records?: PresentationRecord[];
  comparison?: Array<{ label: string; value: number; displayValue?: string }>;
  steps?: string[];
  progress?: { label: string; value: number };
  pagination?: { from: number; to: number; total: number; hasMore?: boolean; nextPrompt?: string };
  actions?: Array<{ label: string; route?: string; prompt?: string; variant?: 'primary' | 'secondary' }>;
  footnote?: string;
}

interface GeneratedExportData {
  title: string;
  fileName: string;
  formats: DownloadFormat[];
  columns: string[];
  rows: string[][];
  filters?: Record<string, string>;
  totalMatching: number;
  recordsIncluded: number;
  truncated?: boolean;
  generatedAt: string;
  footnote?: string;
}

interface GenAIResponseData {
  assistant: AssistantPayload;
  sourceMetrics: SourceMetric[];
  presentation?: ResponsePresentation | null;
  exportData?: GeneratedExportData | null;
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
  conversation?: AIConversation;
  persistedMessages?: {
    user?: StoredAIMessage;
    assistant?: StoredAIMessage;
  };
}

interface CurrentPageContext {
  route?: string;
  currentModule?: string;
  currentFilters?: {
    survey_id?: number;
    survey_title?: string;
    program_code?: string;
    year_graduated?: string;
    response_status?: string;
  };
}

interface AssistantConfig {
  roleLabel: string;
  welcome: string;
  suggestions: string[];
  supportsReportContext: boolean;
  supportsHistory?: boolean;
}

interface AIConversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
  last_message_sender?: 'user' | 'assistant' | null;
  last_message_at?: string | null;
  message_count?: number;
}

interface StoredAIMessage {
  id: number;
  sender: 'user' | 'assistant';
  message: string;
  metadata?: {
    response?: GenAIResponseData;
    request_failed?: boolean;
  } | null;
  created_at: string;
}

interface ChatMessage {
  id: string;
  role: 'admin' | 'assistant';
  content: string;
  createdAt: string;
  response?: GenAIResponseData;
  error?: string;
}

interface DownloadFeedback {
  status: 'preparing' | 'success' | 'error';
  message: string;
  updatedAt: number;
}

const REPORT_CONTEXT_STORAGE_KEY_PREFIX = 'gradtrack_genai_report_context';
const makeMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const parseServerDate = (value: string) => new Date(value.includes('T') ? value : value.replace(' ', 'T'));

const formatConversationDate = (value: string) => parseServerDate(value).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const currentModuleForRoute = (route: string, role?: string) => {
  if (route === '/admin/graduates' || route.startsWith('/admin/graduates/')) {
    return role === 'registrar' ? 'Manage Graduates' : 'Graduate Survey Participation';
  }
  const modules: Array<[string, string]> = [
    ['/admin/alumni-registered-list', 'Alumni Verification'],
    ['/admin/announcements', 'Announcements'],
    ['/admin/forum-moderation', 'Forum Moderation'],
    ['/admin/job-approvals', 'Job Approval'],
    ['/admin/job-postings', 'Job Postings'],
    ['/admin/user-management', 'User Management'],
    ['/admin/auto-reminders', 'Auto Email Reminders'],
    ['/admin/audit-trail', 'Audit Trail'],
    ['/admin/backup-database', 'Backup Database'],
    ['/admin/system-settings', 'System Settings'],
    ['/admin/survey-status', 'Survey Participation'],
    ['/admin/surveys', 'Survey Management'],
    ['/admin/reports', 'Reports & Analytics'],
    ['/admin', 'Dashboard'],
  ];
  return modules.find(([path]) => route === path || route.startsWith(`${path}/`))?.[1] || 'GradTrack';
};

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

const suggestionsForModule = (module: string, fallback: string[]) => {
  const suggestions: Record<string, string[]> = {
    'Graduate Survey Participation': [
      'Show graduates without survey responses',
      'Compare responses by program',
      'Show the response rate',
      'What does this page do?',
    ],
    'Survey Participation': [
      'Show graduates without survey responses',
      'Show participation for my programs',
      'Show the response rate',
      'How do I notify nonrespondents?',
    ],
    'Survey Management': [
      'What does Survey Management do?',
      'How do I create a survey?',
      'Can I edit an active survey?',
      'Where can I review responses?',
    ],
    'Reports & Analytics': [
      'Summarize employment statistics',
      'Compare employment by program',
      'Explain job-course alignment',
      'Create a PDF report',
    ],
    'Manage Graduates': [
      'Show graduate records',
      'How do I import graduates from Excel?',
      'How do I filter graduates by batch?',
      'How do I archive a graduate record?',
    ],
    'Job Postings': [
      'Show my job posting summary',
      'How do I create a job post?',
      'How do I archive a job post?',
      'What happens when a job is archived?',
    ],
  };
  return suggestions[module] || fallback;
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
  if (blob.size === 0) {
    throw new Error('The generated file is empty.');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
};

const fileSafeName = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'gradtrack_genai_report';

const generatedExportBaseName = (exportData: GeneratedExportData) => (
  `${fileSafeName(exportData.fileName || exportData.title)}_${new Date(exportData.generatedAt).toISOString().slice(0, 10)}`
);

const downloadGeneratedExportPdf = (exportData: GeneratedExportData) => {
  const pdf = new jsPDF('p', 'pt', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 38;

  pdf.setFillColor(27, 42, 74);
  pdf.rect(0, 0, pageWidth, 88, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(17);
  pdf.text('Norzagaray College - GradTrack', margin, 37);
  pdf.setFontSize(11);
  pdf.text(exportData.title, margin, 60);

  let startY = 112;
  pdf.setTextColor(55, 65, 81);
  pdf.setFontSize(9);
  pdf.text(`Generated: ${new Date(exportData.generatedAt).toLocaleString()}`, margin, startY);
  startY += 14;
  pdf.text(`Records included: ${exportData.recordsIncluded} of ${exportData.totalMatching}`, margin, startY);
  startY += 14;
  const filterText = Object.entries(exportData.filters || {}).map(([label, value]) => `${label}: ${value}`).join(' | ');
  if (filterText) {
    const filterLines = pdf.splitTextToSize(`Filters: ${filterText}`, pageWidth - margin * 2);
    pdf.text(filterLines, margin, startY);
    startY += filterLines.length * 11 + 8;
  } else {
    startY += 8;
  }

  autoTable(pdf, {
    startY,
    head: [exportData.columns],
    body: exportData.rows,
    margin: { left: margin, right: margin, bottom: 34 },
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const pageCount = (pdf as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 86, pageHeight - 16);
    pdf.text('Generated by GradTrack AI', margin, pageHeight - 16);
  }
  downloadBlob(pdf.output('blob'), `${generatedExportBaseName(exportData)}.pdf`);
};

const downloadGeneratedExportXlsx = async (exportData: GeneratedExportData) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GradTrack AI';
  workbook.created = new Date(exportData.generatedAt);
  const worksheet = workbook.addWorksheet('GradTrack Records');
  const columnCount = Math.max(1, exportData.columns.length);

  worksheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = exportData.title;
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF1B2A4A' } };
  worksheet.addRow(['Generated', new Date(exportData.generatedAt).toLocaleString()]);
  worksheet.addRow(['Records Included', `${exportData.recordsIncluded} of ${exportData.totalMatching}`]);
  Object.entries(exportData.filters || {}).forEach(([label, value]) => worksheet.addRow([label, value]));
  worksheet.addRow([]);
  const headerRow = worksheet.addRow(exportData.columns);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  exportData.rows.forEach((row) => worksheet.addRow(row));
  worksheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  worksheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: columnCount },
  };
  worksheet.columns.forEach((column, columnIndex) => {
    const candidates = [exportData.columns[columnIndex] || '', ...exportData.rows.map((row) => row[columnIndex] || '')];
    column.width = Math.max(12, Math.min(48, Math.max(...candidates.map((value) => String(value).length)) + 3));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${generatedExportBaseName(exportData)}.xlsx`,
  );
};

const downloadGeneratedExportCsv = (exportData: GeneratedExportData) => {
  const rows = [exportData.columns, ...exportData.rows];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadBlob(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }),
    `${generatedExportBaseName(exportData)}.csv`,
  );
};

const downloadGeneratedExport = async (exportData: GeneratedExportData, format: DownloadFormat) => {
  if (format === 'xlsx') {
    await downloadGeneratedExportXlsx(exportData);
    return;
  }
  if (format === 'csv') {
    downloadGeneratedExportCsv(exportData);
    return;
  }
  downloadGeneratedExportPdf(exportData);
};

const assistantRequestErrorMessage = (
  response: Response,
  result: { error?: string; error_code?: string } | null,
) => {
  if (response.status === 401) return 'Your GradTrack session has expired. Please sign in again.';
  if (response.status === 403) return result?.error || 'This GradTrack feature is not available to your account.';
  if (response.status === 429 || result?.error_code === 'rate_limit') {
    return 'GradTrack Assistant is receiving too many requests. Please try again shortly.';
  }
  if (result?.error_code === 'empty_response') {
    return 'GradTrack Assistant returned an empty response. Please try again.';
  }
  if (result?.error_code === 'ai_network_error') {
    return 'GradTrack Assistant cannot reach the AI service right now. Please try again.';
  }
  if (response.status >= 500) {
    return result?.error || 'GradTrack Assistant is temporarily unable to respond. Please try again.';
  }
  return result?.error || 'Unable to process your GradTrack Assistant request.';
};

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

const renderInlineMarkdown = (value: string, keyPrefix: string): ReactNode[] => (
  value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-strong-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`${keyPrefix}-code-${index}`} className="gt-ai-inline-code">{part.slice(1, -1)}</code>;
    }
    return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;
  })
);

const splitMarkdownRow = (line: string) => line
  .trim()
  .replace(/^\||\|$/g, '')
  .split('|')
  .map((cell) => cell.trim());

const SafeMarkdown = ({ content }: { content: string }) => {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      blocks.push(level === 1
        ? <h3 key={`heading-${index}`} className="gt-ai-markdown-h1">{renderInlineMarkdown(text, `h-${index}`)}</h3>
        : <h4 key={`heading-${index}`} className="gt-ai-markdown-h2">{renderInlineMarkdown(text, `h-${index}`)}</h4>);
      index += 1;
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const headers = splitMarkdownRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitMarkdownRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div key={`table-${index}`} className="gt-ai-markdown-table-wrap" role="region" aria-label="Assistant table" tabIndex={0}>
          <table className="gt-ai-markdown-table">
            <thead><tr>{headers.map((header, cellIndex) => <th key={cellIndex}>{renderInlineMarkdown(header, `th-${index}-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(row[cellIndex] || '', `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`} className="gt-ai-markdown-list">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `uli-${index}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`} className="gt-ai-markdown-list gt-ai-markdown-list--ordered">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `oli-${index}-${itemIndex}`)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^\s*[-*]\s+/.test(lines[index])
      && !/^\s*\d+[.)]\s+/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`} className="gt-ai-markdown-paragraph">{renderInlineMarkdown(paragraph.join(' '), `p-${index}`)}</p>);
  }

  return <div className="gt-ai-markdown">{blocks}</div>;
};

export default function GradTrackGenAIAssistant() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasNewResult, setHasNewResult] = useState(false);
  const [view, setView] = useState<'history' | 'conversation'>('history');
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<AIConversation | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationPendingDelete, setConversationPendingDelete] = useState<AIConversation | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('Thinking...');
  const [reportContext, setReportContext] = useState<ReportContext | null>(null);
  const [currentPageContext, setCurrentPageContext] = useState<CurrentPageContext>({});
  const [resetContextRequested, setResetContextRequested] = useState(false);
  const [assistantConfig, setAssistantConfig] = useState<AssistantConfig | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<Record<string, DownloadFeedback>>({});
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const submittingRef = useRef(false);
  const loadingTimersRef = useRef<number[]>([]);

  const isAdminPath = location.pathname.startsWith('/admin');
  const currentModule = useMemo(() => currentModuleForRoute(location.pathname, user?.role), [location.pathname, user?.role]);
  const welcomeSuggestions = useMemo(
    () => suggestionsForModule(currentModule, assistantConfig?.suggestions || []),
    [assistantConfig?.suggestions, currentModule],
  );
  const shouldShow = Boolean(assistantConfig) && isAdminPath;
  const reportContextStorageKey = useMemo(
    () => `${REPORT_CONTEXT_STORAGE_KEY_PREFIX}_${user?.id ?? 'anonymous'}`,
    [user?.id],
  );
  const contextLabel = useMemo(
    () => {
      const filters = currentPageContext.currentFilters;
      const activeFilters = [filters?.program_code, filters?.year_graduated]
        .filter((value): value is string => Boolean(value));
      if (filters?.response_status && filters.response_status !== 'all') {
        activeFilters.push(toTitle(filters.response_status));
      }
      if (activeFilters.length > 0) return activeFilters.join(' · ');
      return assistantConfig?.supportsReportContext
        ? buildContextLabel(reportContext)
        : `Role scope: ${assistantConfig?.roleLabel || 'GradTrack'}`;
    },
    [assistantConfig, currentPageContext.currentFilters, reportContext],
  );
  const contextIsAvailable = Boolean(
    activeConversation
      || (assistantConfig?.supportsReportContext && (reportContext?.surveyId || reportContext?.reportType || reportContext?.tab)),
  );

  const clearLoadingTimers = useCallback(() => {
    loadingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    loadingTimersRef.current = [];
  }, []);

  const startLoadingStages = useCallback((isReportRequest: boolean, isDataRequest = false) => {
    clearLoadingTimers();
    const stages = isReportRequest
      ? ['Thinking...', 'Preparing report data...', 'Generating AI summary...']
      : isDataRequest
        ? ['Understanding your question...', 'Checking authorized GradTrack data...', 'Preparing a verified response...']
        : ['Thinking...', 'Understanding your GradTrack question...', 'Generating response...'];
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

  const loadConversations = useCallback(async (showLoading = true) => {
    if (showLoading) setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch(`${API_ENDPOINTS.GENAI_ASSISTANT}?resource=conversations`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Unable to load AI conversation history.');
      }
      setConversations(Array.isArray(result.data?.conversations) ? result.data.conversations : []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Unable to load AI conversation history.');
    } finally {
      if (showLoading) setHistoryLoading(false);
    }
  }, []);

  const createConversation = useCallback(() => {
    if (loading) return;
    setHistoryError('');
    setActiveConversation(null);
    setMessages([]);
    setInput('');
    setHasNewResult(false);
    setView('conversation');
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [loading]);

  const openConversation = useCallback(async (conversation: AIConversation) => {
    if (loading || conversationLoading) return;
    setConversationLoading(true);
    setHistoryError('');
    try {
      const response = await fetch(`${API_ENDPOINTS.GENAI_ASSISTANT}?resource=messages&conversation_id=${conversation.id}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Unable to open this AI conversation.');
      }
      const stored = (Array.isArray(result.data?.messages) ? result.data.messages : []) as StoredAIMessage[];
      setMessages(stored.map((message) => ({
        id: String(message.id),
        role: message.sender === 'user' ? 'admin' : 'assistant',
        content: message.message,
        createdAt: message.created_at,
        response: message.sender === 'assistant' ? message.metadata?.response : undefined,
        error: message.metadata?.request_failed ? 'The request could not be completed.' : undefined,
      })));
      setActiveConversation((result.data?.conversation || conversation) as AIConversation);
      setView('conversation');
      window.setTimeout(() => inputRef.current?.focus(), 80);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Unable to open this AI conversation.');
    } finally {
      setConversationLoading(false);
    }
  }, [conversationLoading, loading]);

  const showHistory = useCallback(() => {
    setView('history');
    setHistoryError('');
    setConversationPendingDelete(null);
    void loadConversations();
  }, [loadConversations]);

  const deleteConversation = useCallback(async () => {
    if (!conversationPendingDelete || deleteLoading || loading) return;
    setDeleteLoading(true);
    setHistoryError('');
    try {
      const response = await fetch(
        `${API_ENDPOINTS.GENAI_ASSISTANT}?conversation_id=${conversationPendingDelete.id}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Unable to delete this AI conversation.');
      }

      setConversations((current) => current.filter((item) => item.id !== conversationPendingDelete.id));
      if (activeConversation?.id === conversationPendingDelete.id) {
        setActiveConversation(null);
        setMessages([]);
      }
      setConversationPendingDelete(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Unable to delete this AI conversation.');
    } finally {
      setDeleteLoading(false);
    }
  }, [activeConversation?.id, conversationPendingDelete, deleteLoading, loading]);

  const clearContext = () => {
    setReportContext(null);
    sessionStorage.removeItem(reportContextStorageKey);
    setResetContextRequested(true);
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
    setConversations([]);
    setActiveConversation(null);
    setConversationPendingDelete(null);
    setView('history');
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
          if (config) {
            void loadConversations();
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAssistantConfig(null);
        }
      });

    return () => controller.abort();
  }, [isAdminPath, loadConversations, user?.id, user?.role]);

  const sendMessage = useCallback(async (prompt?: string, action: GenAIAction = 'chat', explicitContext?: ReportContext) => {
    const messageText = (prompt ?? input).trim();
    if (!messageText || loading || submittingRef.current) {
      return;
    }
    submittingRef.current = true;

    const activeContext = explicitContext
      ?? (location.pathname.startsWith('/admin/reports') ? reportContext : null);
    const userMessage: ChatMessage = {
      id: makeMessageId(),
      role: 'admin',
      content: messageText,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setView('conversation');
    setInput('');
    setLoading(true);
    startLoadingStages(
      action === 'generate_report' || /\b(report|pdf|excel|xlsx|csv|download|export)\b/i.test(messageText),
      /\b(how many|count|total|rate|statistics|compare|show|list|answered|response|employed|jobs?|graduates?|alumni)\b/i.test(messageText),
    );

    try {
      let conversationId = activeConversation?.id || 0;
      if (conversationId === 0) {
        const createResponse = await fetch(API_ENDPOINTS.GENAI_ASSISTANT, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create_conversation' }),
        });
        const createResult = await createResponse.json().catch(() => null);
        if (!createResponse.ok || !createResult?.success || !createResult.data?.conversation) {
          throw new Error(assistantRequestErrorMessage(createResponse, createResult));
        }
        const createdConversation = createResult.data.conversation as AIConversation;
        conversationId = createdConversation.id;
        setActiveConversation(createdConversation);
      }

      const response = await fetch(API_ENDPOINTS.GENAI_ASSISTANT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          message: messageText,
          conversation_id: conversationId,
          page_context: {
            route: location.pathname,
            current_module: currentModule,
            current_filters: currentPageContext.currentFilters || {},
          },
          report_context: activeContext,
          reset_context: resetContextRequested,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(assistantRequestErrorMessage(response, result));
      }

      const data = result.data as GenAIResponseData;
      if (!data?.assistant?.answer?.trim()) {
        throw new Error('GradTrack Assistant returned an empty response. Please try again.');
      }
      const assistantMessage: ChatMessage = {
        id: String(data.persistedMessages?.assistant?.id || makeMessageId()),
        role: 'assistant',
        content: data.assistant.answer,
        createdAt: data.persistedMessages?.assistant?.created_at || new Date().toISOString(),
        response: data,
      };

      setMessages((current) => [...current, assistantMessage]);
      if (data.exportData?.formats?.length) {
        try {
          for (const format of data.exportData.formats) {
            await downloadGeneratedExport(data.exportData, format);
          }
        } catch (exportError) {
          console.error('GradTrack AI could not generate the requested local file.', exportError);
        }
      }
      setResetContextRequested(false);
      if (data.conversation) {
        setActiveConversation(data.conversation);
      }
      void loadConversations(false);
      if (data.context && location.pathname.startsWith('/admin/reports')) {
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
      const message = error instanceof TypeError
        ? 'A network error prevented GradTrack Assistant from responding. Check your connection and try again.'
        : error instanceof Error
          ? error.message
          : 'GradTrack Assistant is temporarily unable to respond. Please try again.';
      setMessages((current) => [
        ...current,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: message || "I couldn't generate a response right now. Please try again.",
          createdAt: new Date().toISOString(),
          error: message,
        },
      ]);
    } finally {
      clearLoadingTimers();
      submittingRef.current = false;
      setLoading(false);
      setLoadingStage('Thinking...');
    }
  }, [activeConversation?.id, clearLoadingTimers, contextLabel, currentModule, currentPageContext.currentFilters, input, isMinimized, isOpen, loadConversations, loading, location.pathname, reportContext, resetContextRequested, startLoadingStages, updateStoredContext]);

  const copyMessage = async (message: ChatMessage) => {
    const presentation = message.response?.presentation;
    const presentationLines = presentation
      ? [
          presentation.title || '',
          presentation.summary || '',
          ...(presentation.stats || []).map((stat) => `${stat.label}: ${stat.value}`),
          ...(presentation.records || []).map((record) => [
            record.title,
            ...(record.details || []).map((detail) => detail.value),
            record.status || '',
          ].filter(Boolean).join(' - ')),
          ...(presentation.comparison || []).map((item) => `${item.label}: ${item.displayValue || item.value}`),
        ].filter(Boolean)
      : [];
    const details = message.response
      ? [
          message.content,
          ...presentationLines,
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

    downloadBlob(pdf.output('blob'), `${fileSafeName(title)}_${new Date().toISOString().slice(0, 10)}.pdf`);
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

  const startReportDownload = async (
    messageId: string,
    format: DownloadFormat,
    generate: () => void | Promise<void>,
  ) => {
    const key = `${messageId}:${format}`;
    const formatLabel = format === 'xlsx' ? 'Excel' : format.toUpperCase();
    setDownloadFeedback((current) => ({
      ...current,
      [key]: {
        status: 'preparing',
        message: `Preparing ${formatLabel} file...`,
        updatedAt: Date.now(),
      },
    }));

    try {
      await generate();
      setDownloadFeedback((current) => ({
        ...current,
        [key]: {
          status: 'success',
          message: `${formatLabel} download started. Check Chrome Downloads if it is not visible.`,
          updatedAt: Date.now(),
        },
      }));
    } catch (downloadError) {
      console.error('GradTrack AI could not generate the requested local file.', downloadError);
      setDownloadFeedback((current) => ({
        ...current,
        [key]: {
          status: 'error',
          message: downloadError instanceof Error
            ? `Download failed: ${downloadError.message}`
            : `Download failed. Please try the ${formatLabel} button again.`,
          updatedAt: Date.now(),
        },
      }));
    }
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

    const handlePageContextUpdate = (event: Event) => {
      const detail = (event as CustomEvent<CurrentPageContext>).detail;
      if (detail && (!detail.route || detail.route === location.pathname)) {
        setCurrentPageContext(detail);
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
    window.addEventListener('gradtrack:page-context', handlePageContextUpdate as EventListener);
    return () => {
      window.removeEventListener('gradtrack:report-context', handleContextUpdate as EventListener);
      window.removeEventListener('gradtrack:genai-open', handleOpen as EventListener);
      window.removeEventListener('gradtrack:page-context', handlePageContextUpdate as EventListener);
    };
  }, [assistantConfig?.supportsReportContext, location.pathname, reportContext, sendMessage, updateStoredContext]);

  useEffect(() => {
    setCurrentPageContext((current) => current.route === location.pathname
      ? current
      : { route: location.pathname, currentModule });
  }, [currentModule, location.pathname]);

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

  useEffect(() => {
    if (!isOpen || isMinimized || view !== 'conversation') return;
    const frame = window.requestAnimationFrame(() => {
      const container = messagesScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationLoading, isMinimized, isOpen, loading, messages.length, view]);

  if (!shouldShow) {
    return null;
  }

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;

  const renderPresentation = (presentation?: ResponsePresentation | null) => {
    if (!presentation) return null;
    const stats = presentation.stats || [];
    const records = presentation.records || [];
    const comparisons = presentation.comparison || [];
    const maxComparison = Math.max(1, ...comparisons.map((item) => item.value));
    const Icon = presentation.kind === 'list'
      ? ListFilter
      : presentation.kind === 'comparison'
        ? BarChart3
        : presentation.kind === 'empty'
          ? AlertCircle
          : CheckCircle2;

    const runAction = (action: NonNullable<ResponsePresentation['actions']>[number]) => {
      if (action.prompt) {
        void sendMessage(action.prompt);
        return;
      }
      if (action.route?.startsWith('/') && !action.route.startsWith('//')) {
        navigate(action.route);
        setIsMinimized(true);
      }
    };

    return (
      <section className={`gt-ai-presentation gt-ai-presentation--${presentation.kind}`}>
        {(presentation.title || presentation.summary) && (
          <div className="gt-ai-presentation-heading">
            <span className="gt-ai-presentation-icon"><Icon className="h-4 w-4" /></span>
            <div className="min-w-0">
              {presentation.title && <h3>{presentation.title}</h3>}
              {presentation.summary && <p>{presentation.summary}</p>}
            </div>
          </div>
        )}

        {stats.length > 0 && (
          <div className="gt-ai-stat-grid">
            {stats.map((stat) => (
              <div key={`${stat.label}-${stat.value}`} className={`gt-ai-stat gt-ai-stat--${stat.tone || 'neutral'}`}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        )}

        {presentation.progress && (
          <div className="gt-ai-progress-block">
            <div><span>{presentation.progress.label}</span><strong>{Math.max(0, Math.min(100, presentation.progress.value)).toFixed(1)}%</strong></div>
            <div className="gt-ai-progress-track" role="progressbar" aria-label={presentation.progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={presentation.progress.value}>
              <span style={{ width: `${Math.max(0, Math.min(100, presentation.progress.value))}%` }} />
            </div>
          </div>
        )}

        {records.length > 0 && (
          <div className="gt-ai-record-list">
            {presentation.pagination && (
              <p className="gt-ai-record-range">Showing {presentation.pagination.from}-{presentation.pagination.to} of {presentation.pagination.total}</p>
            )}
            {records.map((record, recordIndex) => (
              <article key={`${record.title}-${recordIndex}`} className="gt-ai-record-row">
                <div className="min-w-0 flex-1">
                  <h4>{record.title}</h4>
                  {(record.details || []).length > 0 && (
                    <p>{record.details?.map((detail) => detail.value).filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                {record.status && <span className={`gt-ai-status-pill gt-ai-status-pill--${record.tone || 'neutral'}`}>{record.status}</span>}
              </article>
            ))}
          </div>
        )}

        {comparisons.length > 0 && (
          <div className="gt-ai-comparison-list">
            {comparisons.map((item) => (
              <div key={item.label} className="gt-ai-comparison-row">
                <div><span>{item.label}</span><strong>{item.displayValue || item.value}</strong></div>
                <div className="gt-ai-comparison-track"><span style={{ width: `${item.value <= 0 ? 0 : Math.max(3, (item.value / maxComparison) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        )}

        {(presentation.steps || []).length > 0 && (
          <ol className="gt-ai-step-list">
            {presentation.steps?.map((step, stepIndex) => (
              <li key={stepIndex}><span>{stepIndex + 1}</span><p>{step}</p></li>
            ))}
          </ol>
        )}

        {(presentation.pagination?.hasMore || (presentation.actions || []).length > 0) && (
          <div className="gt-ai-action-row">
            {presentation.pagination?.hasMore && (
              <button type="button" onClick={() => void sendMessage(presentation.pagination?.nextPrompt || 'Show next 10')} className="gt-ai-action gt-ai-action--secondary">
                Show next 10 <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            {presentation.actions?.map((action) => (
              <button key={`${action.label}-${action.route || action.prompt}`} type="button" onClick={() => runAction(action)} className={`gt-ai-action gt-ai-action--${action.variant || 'secondary'}`}>
                {action.label} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}

        {presentation.footnote && <p className="gt-ai-presentation-footnote">{presentation.footnote}</p>}
      </section>
    );
  };

  const renderAssistantSections = (message: ChatMessage) => {
    const response = message.response;
    const assistant = response?.assistant;

    if (!assistant) {
      return (
        <div className="space-y-2">
          <div className="gt-ai-message-identity"><Bot className="h-3.5 w-3.5" /><span>GradTrack AI</span></div>
          <SafeMarkdown content={message.content} />
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

    const reportReady = Boolean(assistant.reportRequest?.isReportRequest && (response.dataset || response.exportData));
    const preferredFormat = getFormatFromResponse(response);
    const isDirect = assistant.responseMode === 'direct';
    const presentation = response.presentation;
    const feedbackEntries = (['pdf', 'xlsx', 'csv'] as DownloadFormat[])
      .map((format) => ({ format, feedback: downloadFeedback[`${message.id}:${format}`] }))
      .filter((entry): entry is { format: DownloadFormat; feedback: DownloadFeedback } => Boolean(entry.feedback))
      .sort((left, right) => right.feedback.updatedAt - left.feedback.updatedAt);
    const activeDownload = feedbackEntries.find((entry) => entry.feedback.status === 'preparing');
    const latestDownloadFeedback = activeDownload || feedbackEntries[0];

    return (
      <div className="space-y-4">
        <div className="gt-ai-message-identity"><Bot className="h-3.5 w-3.5" /><span>GradTrack AI</span><small>{currentModule} Assistant</small></div>
        {renderPresentation(presentation)}
        {presentation?.kind !== 'list' && <SafeMarkdown content={assistant.answer} />}

        {isDirect && !presentation && response.sourceMetrics.length > 0 && (
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

        {!isDirect && !presentation && response.sourceMetrics.length > 0 && (
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
                {response.exportData?.formats.includes('xlsx') ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-emerald-950">{response.exportData?.title || buildReportTitle(response)}</p>
                {response.exportData ? (
                  <>
                    <p className="text-xs text-emerald-700">
                      {response.exportData.formats.map((format) => format === 'xlsx' ? 'Excel' : format.toUpperCase()).join(' and ')} generated
                      {' '}from {response.exportData.recordsIncluded} authorized record(s).
                    </p>
                    {response.exportData.truncated && (
                      <p className="mt-1 text-[11px] font-medium text-amber-700">{response.exportData.footnote}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {response.exportData.formats.map((format) => (
                        <button
                          key={format}
                          type="button"
                          onClick={() => void startReportDownload(
                            message.id,
                            format,
                            () => downloadGeneratedExport(response.exportData as GeneratedExportData, format),
                          )}
                          disabled={downloadFeedback[`${message.id}:${format}`]?.status === 'preparing'}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
                        >
                          {downloadFeedback[`${message.id}:${format}`]?.status === 'preparing'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Download className="h-3.5 w-3.5" />}
                          {downloadFeedback[`${message.id}:${format}`]?.status === 'preparing'
                            ? 'Preparing...'
                            : `Download ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}`}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-emerald-700">{preferredFormat.toUpperCase()} - Generated by GradTrack GenAI</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                          onClick={() => void startReportDownload(
                            message.id,
                            preferredFormat,
                            () => downloadReport(response, preferredFormat),
                          )}
                          disabled={downloadFeedback[`${message.id}:${preferredFormat}`]?.status === 'preparing'}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
                      >
                          {downloadFeedback[`${message.id}:${preferredFormat}`]?.status === 'preparing'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Download className="h-3.5 w-3.5" />}
                          {downloadFeedback[`${message.id}:${preferredFormat}`]?.status === 'preparing'
                            ? 'Preparing...'
                            : `Download ${preferredFormat === 'xlsx' ? 'Excel' : preferredFormat.toUpperCase()}`}
                      </button>
                      {(['pdf', 'xlsx', 'csv'] as DownloadFormat[])
                        .filter((format) => format !== preferredFormat)
                        .map((format) => (
                          <button
                            key={format}
                            type="button"
                            onClick={() => void startReportDownload(message.id, format, () => downloadReport(response, format))}
                            disabled={downloadFeedback[`${message.id}:${format}`]?.status === 'preparing'}
                            className="gt-ai-report-secondary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-70"
                          >
                            {downloadFeedback[`${message.id}:${format}`]?.status === 'preparing'
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : null}
                            {format === 'xlsx' ? 'Excel' : format.toUpperCase()}
                          </button>
                        ))}
                    </div>
                  </>
                )}
                {latestDownloadFeedback && (
                  <p
                    className={`mt-2 text-[11px] font-medium ${latestDownloadFeedback.feedback.status === 'error' ? 'text-red-700' : 'text-emerald-800'}`}
                    role={latestDownloadFeedback.feedback.status === 'error' ? 'alert' : 'status'}
                    aria-live="polite"
                  >
                    {latestDownloadFeedback.feedback.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {response.aiError && (
          <div className="gt-ai-warning rounded-lg border px-3 py-2 text-xs">
            I couldn't generate the AI wording right now, so GradTrack returned a verified answer from the authorized server data. Please try again if you want a regenerated response.
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {isOpen && !isMinimized && (
        <div className="fixed inset-x-3 bottom-3 z-[70] sm:inset-x-auto sm:right-5 sm:w-[480px] sm:max-w-[calc(100vw-2.5rem)]">
          <section
            className="gt-ai-chat-panel flex max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
            aria-label="GradTrack AI Assistant chat panel"
          >
            <header className="flex items-center gap-3 border-b bg-[#1b2a4a] px-4 py-3 text-white">
              {view === 'conversation' && (
                <button
                  type="button"
                  onClick={showHistory}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-blue-100 hover:bg-white/10"
                  aria-label="Back to conversation history"
                  title="Conversation history"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div className="relative shrink-0">
                <GradTrackAIMascot compact thinking={loading} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-bold">
                  {view === 'conversation' && activeConversation ? activeConversation.title : 'GradTrack AI Assistant'}
                </h2>
                <p className="truncate text-xs text-blue-100">{currentModule} Assistant</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void createConversation()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-blue-100 hover:bg-white/10"
                  aria-label="New conversation"
                  title="New conversation"
                >
                  <Plus className="h-4 w-4" />
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
                  {view === 'history' ? 'Conversation history' : `Context: ${currentModule} · ${contextLabel}`}
                </span>
                {view === 'conversation' && contextIsAvailable && (
                  <button type="button" onClick={clearContext} className="gt-ai-muted-button font-semibold">
                    Clear context
                  </button>
                )}
              </div>
            </div>

            <div ref={messagesScrollRef} className="gt-ai-messages min-h-[240px] flex-1 overflow-y-auto px-4 py-4 sm:min-h-[360px]">
              {view === 'history' ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => void createConversation()}
                    disabled={conversationLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1d4ed8] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#1e40af] disabled:cursor-wait disabled:opacity-70"
                  >
                    {conversationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    New conversation
                  </button>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="gt-ai-primary-text text-sm font-bold">Previous conversations</h3>
                      <p className="gt-ai-muted-text text-xs">Private to this {assistantConfig?.roleLabel} account and role.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadConversations()}
                      disabled={historyLoading}
                      className="gt-ai-muted-button inline-flex h-8 w-8 items-center justify-center rounded-full"
                      aria-label="Refresh conversation history"
                    >
                      <RefreshCcw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {historyError && (
                    <div className="gt-ai-error flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{historyError}</span>
                    </div>
                  )}

                  {conversationPendingDelete && (
                    <div
                      className="gt-ai-delete-confirm rounded-xl border p-3 shadow-sm"
                      role="alertdialog"
                      aria-labelledby="gt-ai-delete-title"
                      aria-describedby="gt-ai-delete-description"
                    >
                      <div className="flex items-start gap-2.5">
                        <Trash2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p id="gt-ai-delete-title" className="text-sm font-bold">Delete conversation?</p>
                          <p id="gt-ai-delete-description" className="mt-1 text-xs leading-relaxed">
                            “{conversationPendingDelete.title}” and all its messages will be permanently deleted.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConversationPendingDelete(null)}
                          disabled={deleteLoading}
                          className="gt-ai-muted-button rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteConversation()}
                          disabled={deleteLoading || loading}
                          className="gt-ai-delete-confirm-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:cursor-wait disabled:opacity-60"
                        >
                          {deleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          {deleteLoading ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}

                  {historyLoading ? (
                    <div className="gt-ai-muted-text flex items-center justify-center gap-2 py-10 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading conversations...
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="gt-ai-card rounded-2xl border p-5 text-center shadow-sm">
                      <GradTrackAIMascot compact />
                      <p className="gt-ai-primary-text mt-3 font-bold">No conversations yet</p>
                      <p className="gt-ai-muted-text mt-1 text-xs">Start a conversation to ask about authorized GradTrack data.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {conversations.map((conversation) => (
                        <div
                          key={conversation.id}
                          className="gt-ai-history-item group relative rounded-xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <button
                            type="button"
                            onClick={() => void openConversation(conversation)}
                            disabled={conversationLoading || deleteLoading}
                            className="w-full rounded-xl p-3 pr-12 text-left disabled:cursor-wait"
                          >
                            <div className="flex items-start gap-3">
                              <p className="gt-ai-primary-text min-w-0 flex-1 line-clamp-1 text-sm font-bold">{conversation.title}</p>
                              <span className="gt-ai-history-count shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                {conversation.message_count || 0}
                              </span>
                            </div>
                            <div className="gt-ai-muted-text mt-1 flex items-center gap-1 text-[11px]">
                              <Clock3 className="h-3 w-3" />
                              Started {formatConversationDate(conversation.created_at)}
                            </div>
                            <p className="gt-ai-secondary-text mt-2 line-clamp-2 text-xs leading-relaxed">
                              {conversation.last_message_preview || 'No messages yet.'}
                            </p>
                            <p className="gt-ai-muted-text mt-2 text-[10px]">
                              Latest activity {formatConversationDate(conversation.updated_at)}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryError('');
                              setConversationPendingDelete(conversation);
                            }}
                            disabled={deleteLoading || conversationLoading}
                            className="gt-ai-delete-button absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full transition disabled:cursor-wait disabled:opacity-50"
                            aria-label={`Delete conversation: ${conversation.title}`}
                            title="Delete conversation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {conversationLoading && messages.length === 0 && (
                    <div className="gt-ai-muted-text flex items-center justify-center gap-2 py-10 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading conversation...
                    </div>
                  )}

                  {!conversationLoading && messages.length === 0 && (
                    <div className="space-y-4">
                      <div className="gt-ai-card rounded-2xl border p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-3">
                          <GradTrackAIMascot compact />
                          <div>
                            <p className="gt-ai-primary-text font-bold">Hello! I'm GradTrack AI.</p>
                            <p className="gt-ai-muted-text text-xs font-medium">Assistance scoped to your authenticated {assistantConfig?.roleLabel} account.</p>
                          </div>
                        </div>
                        <p className="gt-ai-secondary-text text-sm leading-relaxed">
                          {assistantConfig?.welcome}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {welcomeSuggestions.map((prompt) => (
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
                              <span>{parseServerDate(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
                      <div className="flex justify-start" role="status" aria-live="polite" aria-label="GradTrack Assistant is thinking">
                        <div className="gt-ai-assistant-message max-w-[88%] rounded-2xl border px-4 py-3 text-sm shadow-sm">
                          <div className="flex items-center gap-3">
                            <GradTrackAIMascot compact thinking />
                            <div>
                              <p className="gt-ai-primary-text font-semibold">{loadingStage}</p>
                              <p className="gt-ai-muted-text text-xs">GradTrack AI is analyzing...</p>
                            </div>
                            <Loader2 className="ml-auto h-4 w-4 animate-spin text-blue-600" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {view === 'conversation' && lastMessage?.response?.assistant.suggestedQuestions?.length ? (
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

            {view === 'conversation' && (
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
            )}
          </section>
        </div>
      )}

      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-24 right-5 z-[70]">
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
          aria-label="Open GradTrack AI Assistant"
        >
          <Bot className="h-4 w-4" />
          Open GradTrack AI Assistant
        </button>
      )}

      {isOpen && isMinimized && (
        <button
          type="button"
          onClick={openAssistant}
          className="fixed bottom-48 right-6 z-[70] inline-flex items-center gap-2 rounded-full bg-[#1b2a4a] px-3 py-2 text-xs font-semibold text-white shadow-lg"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Continue chat
        </button>
      )}
    </>
  );
}
