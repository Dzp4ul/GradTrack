import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  FileImage,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  type AlumniMembershipAssetKey,
  type AlumniMembershipBenefit,
  type AlumniMembershipContent,
  type AlumniMembershipFee,
  type AlumniMembershipInformation,
  type AlumniMembershipSection,
  fetchAlumniMembership,
  publishAlumniMembership,
  removeAlumniMembershipImage,
  resolveAlumniMembershipAsset,
  saveAlumniMembershipDraft,
  unpublishAlumniMembership,
  uploadAlumniMembershipImage,
} from '../../services/alumniMembership';

type Notice = { type: 'success' | 'error' | 'info'; message: string } | null;
type ConfigImageField = 'college_logo' | 'alumni_logo' | 'id_card_front' | 'id_card_back';

const fieldClass = 'mt-1.5 w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
const panelClass = 'rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6';

const images: Array<{ key: ConfigImageField; label: string; guidance: string; wide?: boolean }> = [
  { key: 'college_logo', label: 'College logo', guidance: 'Square PNG, JPG, or WebP recommended.' },
  { key: 'alumni_logo', label: 'Alumni Association logo', guidance: 'Square transparent PNG recommended.' },
  { key: 'id_card_front', label: 'Alumni ID — front', guidance: 'Landscape image; minimum 128 × 128 px.', wide: true },
  { key: 'id_card_back', label: 'Alumni ID — back', guidance: 'Upload separately; no combined center divider.', wide: true },
];

const uid = () => `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function FieldLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return <label className="block text-sm font-bold text-text-primary">{children}{required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}</label>;
}

function CollectionActions({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
      <button type="button" onClick={onRemove} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

function ActiveToggle({ active, onChange, label = 'Active' }: { active: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!active)} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-surface-muted text-text-muted'}`}>
      {active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{active ? label : 'Hidden'}
    </button>
  );
}

export default function AlumniMembershipManagement() {
  const [content, setContent] = useState<AlumniMembershipContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [hasPublishedContent, setHasPublishedContent] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [uploading, setUploading] = useState<Partial<Record<ConfigImageField, boolean>>>({});
  const fileInputs = useRef<Partial<Record<ConfigImageField, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetchAlumniMembership('registration', true);
      setContent(response.data);
      setPublishedAt(response.published_at || null);
      setHasPublishedContent(Boolean(response.has_published_content));
      setDirty(false);
    } catch (caught) {
      setNotice({ type: 'error', message: caught instanceof Error ? caught.message : 'Unable to load membership content.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const mark = (next: AlumniMembershipContent) => {
    setContent(next);
    setDirty(true);
  };

  const updateConfig = (field: keyof AlumniMembershipContent['config'], value: string | boolean) => {
    if (!content) return;
    mark({ ...content, config: { ...content.config, [field]: value } });
  };

  const updateBenefit = (index: number, patch: Partial<AlumniMembershipBenefit>) => {
    if (!content) return;
    mark({ ...content, benefits: content.benefits.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };

  const updateFee = (index: number, patch: Partial<AlumniMembershipFee>) => {
    if (!content) return;
    mark({ ...content, fees: content.fees.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };

  const updateInformation = (index: number, patch: Partial<AlumniMembershipInformation>) => {
    if (!content) return;
    mark({ ...content, information_sections: content.information_sections.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };

  const updateSection = (index: number, patch: Partial<AlumniMembershipSection>) => {
    if (!content) return;
    mark({ ...content, section_settings: content.section_settings.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };

  const saveDraft = async (showNotice = true): Promise<boolean> => {
    if (!content) return false;
    setSaving(true);
    if (showNotice) setNotice(null);
    try {
      const response = await saveAlumniMembershipDraft(content);
      setContent(response.data);
      setDirty(false);
      if (showNotice) setNotice({ type: 'success', message: response.message || 'Draft saved successfully.' });
      return true;
    } catch (caught) {
      setNotice({ type: 'error', message: caught instanceof Error ? caught.message : 'Unable to save the draft.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!content || publishing) return;
    setNotice(null);
    setPublishing(true);
    try {
      if (dirty && !(await saveDraft(false))) return;
      const response = await publishAlumniMembership();
      setContent(response.data);
      setPublishedAt(response.published_at || new Date().toISOString());
      setHasPublishedContent(true);
      setDirty(false);
      setNotice({ type: 'success', message: response.message || 'Membership page published successfully.' });
    } catch (caught) {
      setNotice({ type: 'error', message: caught instanceof Error ? caught.message : 'Unable to publish membership content.' });
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!hasPublishedContent || publishing) return;
    if (!window.confirm('Unpublish both alumni membership information pages? Graduates will see the updating message until you publish again.')) return;
    setPublishing(true);
    setNotice(null);
    try {
      const response = await unpublishAlumniMembership();
      setContent(response.data);
      setPublishedAt(null);
      setHasPublishedContent(false);
      setNotice({ type: 'success', message: response.message || 'Membership pages unpublished.' });
    } catch (caught) {
      setNotice({ type: 'error', message: caught instanceof Error ? caught.message : 'Unable to unpublish membership content.' });
    } finally {
      setPublishing(false);
    }
  };

  const handlePreview = async () => {
    const previewWindow = window.open('about:blank', '_blank');
    if (dirty && !(await saveDraft(false))) {
      previewWindow?.close();
      return;
    }
    const previewUrl = '/alumni/membership-information?preview=draft';
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.location.replace(previewUrl);
    } else {
      window.location.assign(previewUrl);
    }
  };

  const setImage = (key: ConfigImageField, path: string | null, url: string | null) => {
    setContent((current) => current ? {
      ...current,
      config: {
        ...current.config,
        [`${key}_path`]: path,
        [`${key}_url`]: url,
      },
    } : current);
  };

  const handleUpload = async (key: ConfigImageField, file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotice({ type: 'error', message: 'Choose a valid JPG, PNG, or WebP image.' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setNotice({ type: 'error', message: 'Images must not exceed 8 MB.' });
      return;
    }
    setUploading((current) => ({ ...current, [key]: true }));
    setNotice(null);
    try {
      const result = await uploadAlumniMembershipImage(key as AlumniMembershipAssetKey, file);
      setImage(key, result.path || null, result.url || null);
      setNotice({ type: 'success', message: `${images.find((item) => item.key === key)?.label || 'Image'} updated in the draft.` });
    } catch (caught) {
      setNotice({ type: 'error', message: caught instanceof Error ? caught.message : 'Unable to upload the image.' });
    } finally {
      setUploading((current) => ({ ...current, [key]: false }));
      const input = fileInputs.current[key];
      if (input) input.value = '';
    }
  };

  const handleRemoveImage = async (key: ConfigImageField) => {
    setUploading((current) => ({ ...current, [key]: true }));
    setNotice(null);
    try {
      await removeAlumniMembershipImage(key as AlumniMembershipAssetKey);
      setImage(key, null, null);
      setNotice({ type: 'success', message: 'Image removed from the draft. Published pages are unchanged until you publish.' });
    } catch (caught) {
      setNotice({ type: 'error', message: caught instanceof Error ? caught.message : 'Unable to remove the image.' });
    } finally {
      setUploading((current) => ({ ...current, [key]: false }));
    }
  };

  const draftFeeTotal = useMemo(
    () => content?.fees.filter((fee) => fee.is_active).reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0) || 0,
    [content?.fees],
  );

  if (loading) {
    return <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4"><Loader2 className="h-10 w-10 animate-spin text-blue-700" aria-label="Loading membership editor" /></div>;
  }

  if (!content) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className={panelClass}><p className="font-semibold text-text-primary">{notice?.message || 'No membership draft is available.'}</p><button type="button" onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 font-bold text-white"><RefreshCw className="h-4 w-4" /> Retry</button></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-emerald-800 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-yellow-300">Alumni President</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Membership Management</h1>
            <p className="mt-3 max-w-3xl leading-7 text-blue-100">Manage the shared branding, benefits, fees, ID previews, and instructions shown on both graduate-facing alumni pages.</p>
            <p className="mt-3 text-xs text-blue-200">{publishedAt ? `Last published ${new Date(publishedAt).toLocaleString('en-PH')}` : 'No content has been published yet.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void handlePreview()} disabled={saving || publishing} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 font-bold hover:bg-white/20 disabled:opacity-50"><Eye className="h-4 w-4" /> Preview draft</button>
            <button type="button" onClick={() => void saveDraft()} disabled={saving || publishing || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-bold text-blue-950 hover:bg-blue-50 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft</button>
            <button type="button" onClick={() => void handlePublish()} disabled={saving || publishing} className="inline-flex items-center gap-2 rounded-xl bg-yellow-300 px-4 py-2.5 font-extrabold text-blue-950 hover:bg-yellow-200 disabled:opacity-50">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish</button>
            {hasPublishedContent && <button type="button" onClick={() => void handleUnpublish()} disabled={saving || publishing} className="inline-flex items-center gap-2 rounded-xl border border-red-200/40 px-4 py-2.5 font-bold text-red-100 hover:bg-red-950/40 disabled:opacity-50"><EyeOff className="h-4 w-4" /> Unpublish</button>}
          </div>
        </div>
      </section>

      {notice && (
        <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200' : notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
          {notice.type === 'success' && <Check className="mt-0.5 h-4 w-4 shrink-0" />}{notice.message}
        </div>
      )}

      <section className={panelClass}>
        <div className="mb-5"><h2 className="text-xl font-black text-text-primary">Branding and page copy</h2><p className="mt-1 text-sm text-text-secondary">Text is stored as plain content and safely rendered on both public views.</p></div>
        <div className="grid gap-5 md:grid-cols-2">
          <div><FieldLabel required>Alumni Association name</FieldLabel><input className={fieldClass} value={content.config.association_name} maxLength={180} onChange={(event) => updateConfig('association_name', event.target.value)} /></div>
          <div><FieldLabel required>Page subtitle</FieldLabel><input className={fieldClass} value={content.config.membership_subtitle} maxLength={220} onChange={(event) => updateConfig('membership_subtitle', event.target.value)} /></div>
          <div><FieldLabel required>Registration page heading</FieldLabel><input className={fieldClass} value={content.config.main_heading} maxLength={220} onChange={(event) => updateConfig('main_heading', event.target.value)} /></div>
          <div className="md:col-span-2"><FieldLabel required>Registration page introduction</FieldLabel><textarea className={fieldClass} rows={3} value={content.config.intro_text} maxLength={3000} onChange={(event) => updateConfig('intro_text', event.target.value)} /></div>
          <div><FieldLabel required>Registered alumni heading</FieldLabel><input className={fieldClass} value={content.config.registered_heading} maxLength={220} onChange={(event) => updateConfig('registered_heading', event.target.value)} /></div>
          <div><FieldLabel required>Registered alumni introduction</FieldLabel><textarea className={fieldClass} rows={3} value={content.config.registered_intro_text} maxLength={3000} onChange={(event) => updateConfig('registered_intro_text', event.target.value)} /></div>
          <div><FieldLabel required>Registration instructions</FieldLabel><textarea className={fieldClass} rows={6} value={content.config.registration_instructions} maxLength={5000} onChange={(event) => updateConfig('registration_instructions', event.target.value)} /></div>
          <div><FieldLabel required>Instructions for existing members</FieldLabel><textarea className={fieldClass} rows={6} value={content.config.registered_instructions} maxLength={5000} onChange={(event) => updateConfig('registered_instructions', event.target.value)} /></div>
          <div><FieldLabel>Contact information</FieldLabel><textarea className={fieldClass} rows={4} value={content.config.contact_information} maxLength={3000} onChange={(event) => updateConfig('contact_information', event.target.value)} /></div>
          <div><FieldLabel>Footer text</FieldLabel><textarea className={fieldClass} rows={4} value={content.config.footer_text} maxLength={500} onChange={(event) => updateConfig('footer_text', event.target.value)} /></div>
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-xl font-black text-text-primary">Registration settings</h2><p className="mt-1 text-sm text-text-secondary">Configure the official external Alumni Association form. Opening this link never creates or approves a GradTrack account.</p></div>
          <ActiveToggle active={content.config.registration_button_enabled} label="Registration enabled" onChange={(value) => updateConfig('registration_button_enabled', value)} />
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div><FieldLabel required={content.config.registration_button_enabled}>Registration button text</FieldLabel><input className={fieldClass} value={content.config.registration_button_text} maxLength={120} onChange={(event) => updateConfig('registration_button_text', event.target.value)} placeholder="Proceed to Alumni Registration" /></div>
          <div><FieldLabel required={content.config.registration_button_enabled}>Official registration link</FieldLabel><input type="url" inputMode="url" className={fieldClass} value={content.config.registration_url} maxLength={1000} onChange={(event) => updateConfig('registration_url', event.target.value)} placeholder="https://forms.gle/..." /></div>
        </div>
        <p className="mt-3 text-xs leading-5 text-text-muted">Only HTTPS links are accepted. The public button opens the form in a new tab with opener access disabled.</p>
      </section>

      <section className={panelClass}>
        <div className="mb-5"><h2 className="text-xl font-black text-text-primary">Brand and ID images</h2><p className="mt-1 text-sm text-text-secondary">Uploads are content-validated and stored through GradTrack’s configured storage service. Changes remain in the draft until publishing.</p></div>
        <div className="grid gap-5 md:grid-cols-2">
          {images.map((definition) => {
            const url = resolveAlumniMembershipAsset(content.config[`${definition.key}_url`] || content.config[`${definition.key}_path`]);
            return (
              <article key={definition.key} className="rounded-2xl border border-border bg-surface-alt p-4">
                <div className={`flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface ${definition.wide ? 'aspect-[1.586/1]' : 'h-52'}`}>
                  {url ? <img src={url} alt={`${definition.label} preview`} className="h-full w-full object-contain p-2" /> : <FileImage className="h-12 w-12 text-text-muted" />}
                </div>
                <h3 className="mt-4 font-extrabold text-text-primary">{definition.label}</h3>
                <p className="mt-1 text-xs text-text-muted">{definition.guidance} Maximum 8 MB.</p>
                <input ref={(node) => { fileInputs.current[definition.key] = node; }} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void handleUpload(definition.key, event.target.files?.[0])} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={uploading[definition.key]} onClick={() => fileInputs.current[definition.key]?.click()} className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-3 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{uploading[definition.key] ? <Loader2 className="h-4 w-4 animate-spin" /> : url ? <Upload className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}{url ? 'Replace' : 'Upload'}</button>
                  {url && <button type="button" disabled={uploading[definition.key]} onClick={() => void handleRemoveImage(definition.key)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"><Trash2 className="h-4 w-4" /> Remove</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-text-primary">Membership benefits</h2><p className="mt-1 text-sm text-text-secondary">Order, hide, edit, or remove each benefit independently.</p></div><button type="button" onClick={() => mark({ ...content, benefits: [...content.benefits, { id: uid(), title: '', description: '', is_active: true, display_order: content.benefits.length + 1 }] })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Add benefit</button></div>
        <div className="mt-5 space-y-4">
          {content.benefits.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">No benefits configured. The public page will show an empty-state message.</div>}
          {content.benefits.map((benefit, index) => (
            <article key={benefit.id ?? index} className="rounded-xl border border-border bg-surface-alt p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-extrabold uppercase tracking-[0.15em] text-text-muted">Benefit {index + 1}</span><div className="flex items-center gap-2"><ActiveToggle active={benefit.is_active} onChange={(value) => updateBenefit(index, { is_active: value })} /><CollectionActions index={index} count={content.benefits.length} onMove={(direction) => mark({ ...content, benefits: moveItem(content.benefits, index, direction) })} onRemove={() => mark({ ...content, benefits: content.benefits.filter((_, itemIndex) => itemIndex !== index) })} /></div></div>
              <div className="mt-3 grid gap-3 md:grid-cols-[0.7fr_1.3fr]"><input aria-label={`Benefit ${index + 1} title`} placeholder="Benefit title" className={fieldClass} value={benefit.title} maxLength={180} onChange={(event) => updateBenefit(index, { title: event.target.value })} /><textarea aria-label={`Benefit ${index + 1} description`} placeholder="Benefit description" className={fieldClass} rows={2} value={benefit.description} maxLength={3000} onChange={(event) => updateBenefit(index, { description: event.target.value })} /></div>
            </article>
          ))}
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-text-primary">Membership fees</h2><p className="mt-1 text-sm text-text-secondary">Active fees total ₱{draftFeeTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} in the current draft.</p></div><button type="button" onClick={() => mark({ ...content, fees: [...content.fees, { id: uid(), name: '', description: '', amount: '0.00', is_active: true, display_order: content.fees.length + 1 }] })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Add fee</button></div>
        <label className="mt-5 inline-flex items-center gap-3 text-sm font-bold text-text-primary"><input type="checkbox" checked={content.config.total_fee_enabled} onChange={(event) => updateConfig('total_fee_enabled', event.target.checked)} className="h-4 w-4 rounded border-border text-blue-700" /> Display automatically calculated total</label>
        <div className="mt-4 space-y-4">
          {content.fees.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">No fees configured. The public page will say that fee information is being updated.</div>}
          {content.fees.map((fee, index) => (
            <article key={fee.id ?? index} className="rounded-xl border border-border bg-surface-alt p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-extrabold uppercase tracking-[0.15em] text-text-muted">Fee {index + 1}</span><div className="flex items-center gap-2"><ActiveToggle active={fee.is_active} onChange={(value) => updateFee(index, { is_active: value })} /><CollectionActions index={index} count={content.fees.length} onMove={(direction) => mark({ ...content, fees: moveItem(content.fees, index, direction) })} onRemove={() => mark({ ...content, fees: content.fees.filter((_, itemIndex) => itemIndex !== index) })} /></div></div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[0.65fr_1fr_10rem]"><input aria-label={`Fee ${index + 1} name`} placeholder="Fee name" className={fieldClass} value={fee.name} maxLength={180} onChange={(event) => updateFee(index, { name: event.target.value })} /><textarea aria-label={`Fee ${index + 1} description`} placeholder="Description" className={fieldClass} rows={2} value={fee.description} maxLength={3000} onChange={(event) => updateFee(index, { description: event.target.value })} /><div><span className="text-xs font-bold text-text-muted">Amount (PHP)</span><input aria-label={`Fee ${index + 1} amount`} type="number" min="0" max="9999999999.99" step="0.01" className={fieldClass} value={fee.amount} onChange={(event) => updateFee(index, { amount: event.target.value })} /></div></div>
            </article>
          ))}
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-text-primary">Additional information</h2><p className="mt-1 text-sm text-text-secondary">Target content to applicants, registered members, or both audiences.</p></div><button type="button" onClick={() => mark({ ...content, information_sections: [...content.information_sections, { id: uid(), audience: 'both', title: '', content: '', is_active: true, display_order: content.information_sections.length + 1 }] })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Add section</button></div>
        <div className="mt-5 space-y-4">
          {content.information_sections.map((item, index) => (
            <article key={item.id ?? index} className="rounded-xl border border-border bg-surface-alt p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><select aria-label={`Information ${index + 1} audience`} className="rounded-lg border border-border bg-input px-3 py-2 text-xs font-bold text-text-primary" value={item.audience} onChange={(event) => updateInformation(index, { audience: event.target.value as AlumniMembershipInformation['audience'] })}><option value="both">Both pages</option><option value="registration">Registration page</option><option value="registered">Registered members</option></select><div className="flex items-center gap-2"><ActiveToggle active={item.is_active} onChange={(value) => updateInformation(index, { is_active: value })} /><CollectionActions index={index} count={content.information_sections.length} onMove={(direction) => mark({ ...content, information_sections: moveItem(content.information_sections, index, direction) })} onRemove={() => mark({ ...content, information_sections: content.information_sections.filter((_, itemIndex) => itemIndex !== index) })} /></div></div>
              <input aria-label={`Information ${index + 1} title`} placeholder="Section title" className={fieldClass} value={item.title} maxLength={180} onChange={(event) => updateInformation(index, { title: event.target.value })} /><textarea aria-label={`Information ${index + 1} content`} placeholder="Section content" className={fieldClass} rows={3} value={item.content} maxLength={5000} onChange={(event) => updateInformation(index, { content: event.target.value })} />
            </article>
          ))}
        </div>
      </section>

      <section className={panelClass}>
        <div className="mb-5"><h2 className="text-xl font-black text-text-primary">Page section order and visibility</h2><p className="mt-1 text-sm text-text-secondary">These settings control both public pages; audience-specific wording remains separate.</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          {content.section_settings.map((section, index) => (
            <article key={section.section_key} className="rounded-xl border border-border bg-surface-alt p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-extrabold uppercase tracking-[0.14em] text-text-muted">{section.section_key.replace('_', ' ')}</span><div className="flex items-center gap-1"><ActiveToggle active={section.is_visible} label="Visible" onChange={(value) => updateSection(index, { is_visible: value })} /><button type="button" disabled={index === 0} onClick={() => mark({ ...content, section_settings: moveItem(content.section_settings, index, -1) })} className="rounded-lg p-2 hover:bg-surface-hover disabled:opacity-30" aria-label={`Move ${section.section_title} up`}><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={index === content.section_settings.length - 1} onClick={() => mark({ ...content, section_settings: moveItem(content.section_settings, index, 1) })} className="rounded-lg p-2 hover:bg-surface-hover disabled:opacity-30" aria-label={`Move ${section.section_title} down`}><ArrowDown className="h-4 w-4" /></button></div></div>
              <input aria-label={`${section.section_key} section title`} className={fieldClass} value={section.section_title} maxLength={180} onChange={(event) => updateSection(index, { section_title: event.target.value })} />
            </article>
          ))}
        </div>
      </section>

      <div className="sticky bottom-4 z-20 flex justify-end">
        <button type="button" onClick={() => void saveDraft()} disabled={saving || publishing || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-blue-900 px-5 py-3 font-extrabold text-white shadow-xl hover:bg-blue-800 disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{dirty ? 'Save draft changes' : 'Draft is saved'}</button>
      </div>
    </div>
  );
}
