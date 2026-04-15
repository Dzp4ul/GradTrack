import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, DatabaseBackup, FileDown, HardDriveDownload, RefreshCw, Table2 } from 'lucide-react';
import MessageBox from '../../components/MessageBox';
import { API_ENDPOINTS } from '../../config/api';

interface BackupTable {
  table_name: string;
  row_count: number;
  size_bytes: number;
}

interface BackupSummary {
  database_name: string;
  generated_at: string;
  table_count: number;
  total_rows: number;
  size_bytes: number;
  tables: BackupTable[];
}

export default function BackupDatabase() {
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    message: string;
  }>({ isOpen: false, type: 'success', message: '' });

  const fetchSummary = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_ENDPOINTS.BACKUP}?action=summary`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load backup details');
      }

      setSummary(data.data);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load backup details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');

    try {
      const response = await fetch(`${API_ENDPOINTS.BACKUP}?action=download`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const text = await response.text();
        let message = 'Failed to download database backup';

        try {
          const parsed = JSON.parse(text);
          message = parsed.error || message;
        } catch {
          message = text || message;
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const filename = getFilename(response.headers.get('Content-Disposition')) || `gradtrack_backup_${dateStamp()}.sql`;
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setMsgBox({
        isOpen: true,
        type: 'success',
        message: 'Database backup downloaded successfully.',
      });
      await fetchSummary();
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : 'Failed to download database backup';
      setError(message);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DatabaseBackup className="h-6 w-6 text-[#1b2a4a]" />
            <h1 className="text-2xl font-bold text-[#1b2a4a]">Database Backup</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Create a restorable SQL copy of the GradTrack database.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={fetchSummary}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 rounded-lg bg-[#1b2a4a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#263c66] disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            {downloading ? 'Preparing...' : 'Download Backup'}
          </button>
        </div>
      </div>

      {error !== '' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#1b2a4a]" />
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Database" value={summary.database_name || 'Current database'} />
            <MetricTile label="Tables" value={summary.table_count.toLocaleString()} />
            <MetricTile label="Records" value={summary.total_rows.toLocaleString()} />
            <MetricTile label="Approx. Size" value={formatBytes(summary.size_bytes)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b bg-gray-50 px-5 py-4">
                <Table2 className="h-5 w-5 text-[#1b2a4a]" />
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1b2a4a]">Tables Included</h2>
                  <p className="mt-1 text-sm text-gray-500">The backup includes table structure and row data.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Table</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Rows</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.tables.map((table) => (
                      <tr key={table.table_name} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-[#1b2a4a]">{table.table_name}</td>
                        <td className="px-4 py-3 text-right">{table.row_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{formatBytes(table.size_bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="space-y-6">
              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <HardDriveDownload className="h-5 w-5 text-[#1b2a4a]" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1b2a4a]">Backup Checklist</h2>
                </div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
                  <ChecklistItem text="Download before large imports, account cleanup, or survey resets." />
                  <ChecklistItem text="Store the SQL file in a secure drive with limited access." />
                  <ChecklistItem text="Restore only on a test database first when verifying a backup." />
                  <ChecklistItem text={`Last checked: ${formatDate(summary.generated_at)}`} />
                </div>
              </section>

              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1b2a4a]">Restore Note</h2>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  The downloaded file contains SQL statements for table creation and data insert. Keep it private because it may include
                  graduate records, administrator accounts, survey responses, and contact details.
                </p>
              </section>
            </aside>
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          Backup details are not available.
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        type={msgBox.type}
        message={msgBox.message}
      />
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-[#1b2a4a]">{value}</p>
    </div>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
      <span>{text}</span>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString();
}

function getFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return '';
  }

  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || '';
}

function dateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
