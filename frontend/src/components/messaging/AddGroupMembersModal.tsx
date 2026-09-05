import { FormEvent } from 'react';
import { Check, Loader2, Search, UserPlus, X } from 'lucide-react';
import ProfileAvatar from '../ProfileAvatar';
import type { MessagingParticipant } from './types';

interface AddGroupMembersModalProps {
  open: boolean;
  candidates: MessagingParticipant[];
  selectedIds: number[];
  search: string;
  loading: boolean;
  submitting: boolean;
  resolveAssetUrl: (path?: string | null) => string;
  onSearchChange: (value: string) => void;
  onToggle: (graduateId: number) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function AddGroupMembersModal({
  open,
  candidates,
  selectedIds,
  search,
  loading,
  submitting,
  resolveAssetUrl,
  onSearchChange,
  onToggle,
  onClose,
  onSubmit,
}: AddGroupMembersModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/55 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <form onSubmit={onSubmit} className="flex max-h-[min(680px,90vh)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="add-group-members-title">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <div>
            <h2 id="add-group-members-title" className="text-xl font-bold text-slate-950 dark:text-white">Add Members</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Select one or more graduates.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800" aria-label="Close add members">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 px-6 py-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search graduates, program, or batch" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" autoFocus />
          </label>

          {selectedIds.length > 0 && (
            <p className="mt-3 text-xs font-semibold text-blue-700 dark:text-blue-300">{selectedIds.length} graduate{selectedIds.length === 1 ? '' : 's'} selected</p>
          )}

          <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex min-h-44 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-700" /></div>
            ) : candidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No eligible graduates match this search.</div>
            ) : candidates.map((candidate) => {
              const selected = selectedIds.includes(candidate.graduate_id);
              return (
                <button key={candidate.graduate_id} type="button" onClick={() => onToggle(candidate.graduate_id)} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/60' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                  <span className="relative shrink-0">
                    <ProfileAvatar src={candidate.profile_image_path} label={candidate.full_name} resolveUrl={resolveAssetUrl} imageClassName="h-11 w-11 rounded-full object-cover" fallbackClassName="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-200" />
                    {candidate.is_online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{candidate.full_name}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{candidate.program_code || 'Graduate'}{candidate.year_graduated ? ` • Batch ${candidate.year_graduated}` : ''}</span>
                  </span>
                  <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 text-transparent dark:border-slate-600'}`}><Check className="h-4 w-4" /></span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-5 dark:border-slate-800">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
          <button type="submit" disabled={submitting || selectedIds.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
          </button>
        </div>
      </form>
    </div>
  );
}
