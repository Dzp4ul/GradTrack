import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent } from 'react';
import {
  AlertCircle, ArrowDown, ArrowUp, Bold, CheckCircle2, Eye, GripVertical, Heading2,
  ImageOff, ImagePlus, List, ListOrdered, Loader2, Plus, Redo2, RotateCcw, Save,
  Trash2, Type, X,
} from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import {
  AboutSection, FaqCategory, FaqItem, fetchPublicContent, PrivacyMeta, PrivacySection,
  resolvePublicContentAsset, savePublicContent,
} from '../../services/publicContent';

type ContentTab = 'about' | 'faq' | 'privacy';
type AboutResponse = { success: boolean; sections: AboutSection[]; message?: string };
type FaqResponse = { success: boolean; categories: FaqCategory[]; message?: string };
type PrivacyResponse = { success: boolean; meta: PrivacyMeta; sections: PrivacySection[]; message?: string };
type Notice = { type: 'success' | 'error'; message: string } | null;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const enabled = (value: number | boolean) => value === true || Number(value) === 1;
const tempId = () => `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const formatPolicyDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
};

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function PublicWebsiteContentSettings() {
  const [activeTab, setActiveTab] = useState<ContentTab>('about');
  const [about, setAbout] = useState<AboutSection[]>([]);
  const [faq, setFaq] = useState<FaqCategory[]>([]);
  const [privacyMeta, setPrivacyMeta] = useState<PrivacyMeta>({ introductory_statement: '', effective_date: '', last_updated_date: '' });
  const [privacySections, setPrivacySections] = useState<PrivacySection[]>([]);
  const originals = useRef<{ about: AboutSection[]; faq: FaqCategory[]; privacyMeta: PrivacyMeta; privacySections: PrivacySection[] }>({ about: [], faq: [], privacyMeta: { introductory_statement: '', effective_date: '', last_updated_date: '' }, privacySections: [] });
  const [pendingImages, setPendingImages] = useState<Record<number, File>>({});
  const [imagePreviews, setImagePreviews] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const clearImagePreviews = useCallback(() => {
    setImagePreviews((current) => {
      Object.values(current).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
    setPendingImages({});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setNotice(null);
    try {
      const [aboutData, faqData, privacyData] = await Promise.all([
        fetchPublicContent<AboutResponse>('about', true), fetchPublicContent<FaqResponse>('faq', true), fetchPublicContent<PrivacyResponse>('privacy', true),
      ]);
      const next = { about: aboutData.sections, faq: faqData.categories, privacyMeta: privacyData.meta, privacySections: privacyData.sections };
      originals.current = clone(next);
      setAbout(clone(next.about)); setFaq(clone(next.faq)); setPrivacyMeta(clone(next.privacyMeta)); setPrivacySections(clone(next.privacySections));
      clearImagePreviews();
    } catch (caught) {
      setNotice({ type: 'error', message: caught instanceof Error ? caught.message : 'Unable to load public website content.' });
    } finally { setLoading(false); }
  }, [clearImagePreviews]);

  useEffect(() => { void load(); return clearImagePreviews; }, [load, clearImagePreviews]);

  const cancel = () => {
    if (activeTab === 'about') { setAbout(clone(originals.current.about)); clearImagePreviews(); }
    if (activeTab === 'faq') setFaq(clone(originals.current.faq));
    if (activeTab === 'privacy') { setPrivacyMeta(clone(originals.current.privacyMeta)); setPrivacySections(clone(originals.current.privacySections)); }
    setNotice(null);
  };

  const validate = () => {
    if (activeTab === 'about') {
      if (about.some((section) => !section.title.trim() || !section.content.trim())) return 'Every About section needs a title and description.';
      if (about.some((section) => section.section_key === 'cta' && !section.subtitle?.trim())) return 'The About page button label is required.';
    }
    if (activeTab === 'faq') {
      if (faq.some((category) => !category.name.trim())) return 'FAQ category names cannot be empty.';
      if (faq.some((category) => category.items.some((item) => !item.question.trim() || !item.answer.trim()))) return 'FAQ questions and answers cannot be empty.';
    }
    if (activeTab === 'privacy') {
      if (!privacyMeta.introductory_statement.trim() || !privacyMeta.effective_date || !privacyMeta.last_updated_date) return 'The privacy statement and both dates are required.';
      if (privacySections.some((section) => !section.heading.trim() || !section.content_html.replace(/<[^>]*>/g, '').trim())) return 'Privacy section headings and content cannot be empty.';
    }
    return '';
  };

  const uploadAboutImages = async () => {
    const next = clone(about);
    for (const section of next) {
      const file = pendingImages[Number(section.id)];
      if (!file) continue;
      const body = new FormData(); body.append('image', file); body.append('content_id', String(section.id));
      const response = await fetch(`${API_ENDPOINTS.PUBLIC_CONTENT}?page=about&scope=admin&action=upload`, { method: 'POST', credentials: 'include', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || `Unable to upload the image for ${section.title}.`);
      section.image_storage_path = String(data.file_path);
      section.image_path = String(data.file_url || data.file_path);
    }
    return next;
  };

  const save = async () => {
    const error = validate();
    if (error) { setNotice({ type: 'error', message: error }); return; }
    setSaving(true); setNotice(null);
    try {
      let message = '';
      if (activeTab === 'about') {
        const sections = await uploadAboutImages();
        const response = await savePublicContent<AboutResponse>('about', { sections });
        setAbout(clone(response.sections)); originals.current.about = clone(response.sections); clearImagePreviews();
        message = response.message || 'About page content updated successfully.';
      } else if (activeTab === 'faq') {
        const response = await savePublicContent<FaqResponse>('faq', { categories: faq });
        setFaq(clone(response.categories)); originals.current.faq = clone(response.categories);
        message = response.message || 'FAQ updated successfully.';
      } else {
        const response = await savePublicContent<PrivacyResponse>('privacy', { meta: privacyMeta, sections: privacySections });
        setPrivacyMeta(clone(response.meta)); setPrivacySections(clone(response.sections)); originals.current.privacyMeta = clone(response.meta); originals.current.privacySections = clone(response.sections);
        message = response.message || 'Privacy Policy updated successfully.';
      }
      setNotice({ type: 'success', message });
    } catch (caught) { setNotice({ type: 'error', message: caught instanceof Error ? caught.message : 'Unable to save public website content.' }); }
    finally { setSaving(false); }
  };

  const handleImage = (section: AboutSection, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setNotice({ type: 'error', message: 'Use a valid JPG, PNG, or WebP image.' }); return; }
    if (file.size > 4 * 1024 * 1024) { setNotice({ type: 'error', message: 'About images must be 4 MB or smaller.' }); return; }
    const id = Number(section.id); const url = URL.createObjectURL(file);
    setPendingImages((current) => ({ ...current, [id]: file }));
    setImagePreviews((current) => { if (current[id]) URL.revokeObjectURL(current[id]); return { ...current, [id]: url }; });
    setNotice(null);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-9 w-9 animate-spin text-blue-700" /></div>;

  return <div className="space-y-5">
    {notice && <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{notice.message}</div>}
    <div className="flex flex-col justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm lg:flex-row lg:items-center">
      <div className="flex overflow-x-auto">{([{ key: 'about', label: 'About Page' }, { key: 'faq', label: 'FAQ' }, { key: 'privacy', label: 'Privacy Policy' }] as const).map((tab) => <button key={tab.key} type="button" onClick={() => { setActiveTab(tab.key); setNotice(null); }} className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold ${activeTab === tab.key ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{tab.label}</button>)}</div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><Eye className="h-4 w-4" />Preview</button><button type="button" onClick={cancel} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><X className="h-4 w-4" />Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Changes</button></div>
    </div>

    {activeTab === 'about' && <AboutEditor sections={about} setSections={setAbout} previews={imagePreviews} onImage={handleImage} setPendingImages={setPendingImages} setImagePreviews={setImagePreviews} />}
    {activeTab === 'faq' && <FaqEditor categories={faq} setCategories={setFaq} />}
    {activeTab === 'privacy' && <PrivacyEditor meta={privacyMeta} setMeta={setPrivacyMeta} sections={privacySections} setSections={setPrivacySections} />}
    {previewOpen && <PreviewModal tab={activeTab} about={about} faq={faq} privacyMeta={privacyMeta} privacySections={privacySections} imagePreviews={imagePreviews} onClose={() => setPreviewOpen(false)} />}
  </div>;
}

function AboutEditor({ sections, setSections, previews, onImage, setPendingImages, setImagePreviews }: {
  sections: AboutSection[]; setSections: React.Dispatch<React.SetStateAction<AboutSection[]>>; previews: Record<number, string>;
  onImage: (section: AboutSection, event: ChangeEvent<HTMLInputElement>) => void;
  setPendingImages: React.Dispatch<React.SetStateAction<Record<number, File>>>; setImagePreviews: React.Dispatch<React.SetStateAction<Record<number, string>>>;
}) {
  const update = (id: number, values: Partial<AboutSection>) => setSections((current) => current.map((section) => Number(section.id) === id ? { ...section, ...values } : section));
  const clearPending = (id: number) => { setPendingImages((current) => { const next = { ...current }; delete next[id]; return next; }); setImagePreviews((current) => { if (current[id]) URL.revokeObjectURL(current[id]); const next = { ...current }; delete next[id]; return next; }); };
  return <div className="space-y-4">{sections.map((section) => { const id = Number(section.id); const preview = previews[id] || resolvePublicContentAsset(section.image_path); const supportsImage = section.section_key !== 'cta'; return <section key={section.id} className="rounded-xl border bg-white shadow-sm"><div className="border-b bg-gray-50 px-5 py-4"><h3 className="font-bold text-blue-950">{section.section_key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</h3></div><div className={`grid gap-5 p-5 ${supportsImage ? 'lg:grid-cols-[minmax(0,1fr)_280px]' : ''}`}><div className="space-y-4"><Field label="Section title"><input value={section.title} onChange={(event) => update(id, { title: event.target.value })} className="field-input" maxLength={255} /></Field>{section.section_key !== 'mission' && <Field label={section.section_key === 'cta' ? 'Button label' : 'Highlighted title'}><input value={section.subtitle || ''} onChange={(event) => update(id, { subtitle: event.target.value })} className="field-input" maxLength={255} /></Field>}<Field label="Description"><textarea value={section.content} onChange={(event) => update(id, { content: event.target.value })} className="field-input min-h-32 resize-y" maxLength={10000} /></Field></div>{supportsImage && <div><p className="mb-2 text-sm font-semibold text-gray-700">Section image</p><div className="flex h-44 items-center justify-center overflow-hidden rounded-xl border bg-gray-50 p-3">{preview ? <img src={preview} alt="Preview" className="h-full w-full object-contain" /> : <ImageOff className="h-10 w-10 text-gray-300" />}</div><div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-gray-50"><ImagePlus className="h-4 w-4" />Change<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => onImage(section, event)} /></label><button type="button" onClick={() => { clearPending(id); update(id, { image_path: null, image_storage_path: null }); }} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><ImageOff className="h-4 w-4" />Remove</button>{section.default_image_path && <button type="button" onClick={() => { clearPending(id); update(id, { image_path: section.default_image_path, image_storage_path: section.default_image_path }); }} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-gray-50"><RotateCcw className="h-4 w-4" />Restore</button>}</div><p className="mt-2 text-xs text-gray-500">JPG, PNG, or WebP. Maximum 4 MB. Images use contain scaling to preserve aspect ratio.</p></div>}</div></section>; })}</div>;
}

function FaqEditor({ categories, setCategories }: { categories: FaqCategory[]; setCategories: React.Dispatch<React.SetStateAction<FaqCategory[]>> }) {
  const updateCategory = (index: number, values: Partial<FaqCategory>) => setCategories((current) => current.map((category, position) => position === index ? { ...category, ...values } : category));
  const updateItem = (categoryIndex: number, itemIndex: number, values: Partial<FaqItem>) => setCategories((current) => current.map((category, position) => position === categoryIndex ? { ...category, items: category.items.map((item, index) => index === itemIndex ? { ...item, ...values } : item) } : category));
  return <div className="space-y-4">{categories.map((category, categoryIndex) => <section key={category.id} className="rounded-xl border bg-white shadow-sm"><div className="flex flex-wrap items-center gap-2 border-b bg-gray-50 p-4"><GripVertical className="h-5 w-5 text-gray-400" /><input aria-label="FAQ category name" value={category.name} onChange={(event) => updateCategory(categoryIndex, { name: event.target.value })} className="field-input min-w-52 flex-1 font-bold" maxLength={150} /><Toggle checked={enabled(category.is_active)} label="Category visible" onChange={(checked) => updateCategory(categoryIndex, { is_active: checked })} /><OrderButtons index={categoryIndex} length={categories.length} onMove={(direction) => setCategories((current) => move(current, categoryIndex, direction))} /><button type="button" title="Delete category" onClick={() => setCategories((current) => current.filter((_, index) => index !== categoryIndex))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div><div className="space-y-3 p-4">{category.items.map((item, itemIndex) => <div key={item.id} className="rounded-xl border p-4"><div className="flex items-center gap-2"><GripVertical className="h-5 w-5 flex-none text-gray-400" /><input aria-label="FAQ question" value={item.question} onChange={(event) => updateItem(categoryIndex, itemIndex, { question: event.target.value })} placeholder="Question" className="field-input flex-1 font-semibold" maxLength={500} /><OrderButtons index={itemIndex} length={category.items.length} onMove={(direction) => updateCategory(categoryIndex, { items: move(category.items, itemIndex, direction) })} /><button type="button" title="Delete question" onClick={() => updateCategory(categoryIndex, { items: category.items.filter((_, index) => index !== itemIndex) })} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div><textarea aria-label="FAQ answer" value={item.answer} onChange={(event) => updateItem(categoryIndex, itemIndex, { answer: event.target.value })} placeholder="Answer" className="field-input mt-3 min-h-24 resize-y" maxLength={20000} /><div className="mt-3"><Toggle checked={enabled(item.is_active)} label="Visible on public FAQ" onChange={(checked) => updateItem(categoryIndex, itemIndex, { is_active: checked })} /></div></div>)}<button type="button" onClick={() => updateCategory(categoryIndex, { items: [...category.items, { id: tempId(), question: '', answer: '', display_order: category.items.length, is_active: true }] })} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4" />Add Question</button></div></section>)}<button type="button" onClick={() => setCategories((current) => [...current, { id: tempId(), name: '', display_order: current.length, is_active: true, items: [] }])} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" />Add Category</button></div>;
}

function PrivacyEditor({ meta, setMeta, sections, setSections }: { meta: PrivacyMeta; setMeta: React.Dispatch<React.SetStateAction<PrivacyMeta>>; sections: PrivacySection[]; setSections: React.Dispatch<React.SetStateAction<PrivacySection[]>> }) {
  const update = (index: number, values: Partial<PrivacySection>) => setSections((current) => current.map((section, position) => position === index ? { ...section, ...values } : section));
  return <div className="space-y-4"><section className="rounded-xl border bg-white p-5 shadow-sm"><Field label="Introductory privacy statement"><textarea value={meta.introductory_statement} onChange={(event) => setMeta((current) => ({ ...current, introductory_statement: event.target.value }))} className="field-input min-h-32 resize-y" maxLength={20000} /></Field><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Effective date"><input type="date" value={meta.effective_date} onChange={(event) => setMeta((current) => ({ ...current, effective_date: event.target.value }))} className="field-input" /></Field><Field label="Last updated date"><input type="date" value={meta.last_updated_date} onChange={(event) => setMeta((current) => ({ ...current, last_updated_date: event.target.value }))} className="field-input" /></Field></div></section>{sections.map((section, index) => <section key={section.id} className="rounded-xl border bg-white shadow-sm"><div className="flex items-center gap-2 border-b bg-gray-50 p-4"><GripVertical className="h-5 w-5 text-gray-400" /><input aria-label="Privacy section heading" value={section.heading} onChange={(event) => update(index, { heading: event.target.value })} className="field-input flex-1 font-bold" maxLength={255} /><OrderButtons index={index} length={sections.length} onMove={(direction) => setSections((current) => move(current, index, direction))} /><button type="button" title="Delete section" onClick={() => setSections((current) => current.filter((_, position) => position !== index))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div><div className="p-4"><RichTextEditor value={section.content_html} onChange={(value) => update(index, { content_html: value })} /><div className="mt-3"><Toggle checked={enabled(section.is_active)} label="Visible on public Privacy Policy" onChange={(checked) => update(index, { is_active: checked })} /></div></div></section>)}<button type="button" onClick={() => setSections((current) => [...current, { id: tempId(), heading: '', content_html: '<p></p>', display_order: current.length, is_active: true }])} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" />Add Section</button></div>;
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value; }, [value]);
  const command = (name: string, argument?: string) => { ref.current?.focus(); document.execCommand(name, false, argument); if (ref.current) onChange(ref.current.innerHTML); };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); };
  return <div className="overflow-hidden rounded-lg border"><div className="flex flex-wrap gap-1 border-b bg-gray-50 p-2"><EditorButton title="Paragraph" onClick={() => command('formatBlock', 'p')} icon={<Type className="h-4 w-4" />} /><EditorButton title="Heading" onClick={() => command('formatBlock', 'h3')} icon={<Heading2 className="h-4 w-4" />} /><EditorButton title="Bold" onClick={() => command('bold')} icon={<Bold className="h-4 w-4" />} /><EditorButton title="Bulleted list" onClick={() => command('insertUnorderedList')} icon={<List className="h-4 w-4" />} /><EditorButton title="Numbered list" onClick={() => command('insertOrderedList')} icon={<ListOrdered className="h-4 w-4" />} /><EditorButton title="Redo" onClick={() => command('redo')} icon={<Redo2 className="h-4 w-4" />} /></div><div ref={ref} contentEditable suppressContentEditableWarning onInput={(event) => onChange(event.currentTarget.innerHTML)} onPaste={paste} className="public-rich-text min-h-36 bg-white p-4 text-gray-700 outline-none" /></div>;
}

function PreviewModal({ tab, about, faq, privacyMeta, privacySections, imagePreviews, onClose }: { tab: ContentTab; about: AboutSection[]; faq: FaqCategory[]; privacyMeta: PrivacyMeta; privacySections: PrivacySection[]; imagePreviews: Record<number, string>; onClose: () => void }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-bold text-blue-950">Unsaved Preview</h2><p className="text-xs text-gray-500">This preview is private until Save Changes succeeds.</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><div className="max-h-[calc(92vh-75px)] overflow-y-auto bg-gray-50 p-5">{tab === 'about' && <div className="space-y-3">{about.map((section) => <div key={section.id} className="grid items-center gap-5 rounded-xl bg-white p-5 md:grid-cols-[1fr_220px]"><div><h3 className="text-xl font-bold text-blue-900"><span className="text-yellow-500">{section.title} </span>{section.subtitle}</h3><p className="mt-2 text-gray-600">{section.content}</p></div>{(imagePreviews[Number(section.id)] || section.image_path) && <img src={imagePreviews[Number(section.id)] || resolvePublicContentAsset(section.image_path)} alt="" className="h-36 w-full object-contain" />}</div>)}</div>}{tab === 'faq' && <div className="space-y-6">{faq.filter((category) => enabled(category.is_active)).map((category) => <div key={category.id}><h3 className="mb-3 text-xl font-bold text-blue-900">{category.name}</h3><div className="space-y-2">{category.items.filter((item) => enabled(item.is_active)).map((item) => <details key={item.id} className="rounded-lg border bg-white p-4"><summary className="cursor-pointer font-semibold text-blue-900">{item.question}</summary><p className="mt-3 whitespace-pre-line text-gray-600">{item.answer}</p></details>)}</div></div>)}</div>}{tab === 'privacy' && <div className="space-y-7 rounded-xl bg-white p-6 text-gray-700"><p>{privacyMeta.introductory_statement}</p><p>This policy is effective as of {formatPolicyDate(privacyMeta.effective_date)}, and was last updated on {formatPolicyDate(privacyMeta.last_updated_date)}.</p>{privacySections.filter((section) => enabled(section.is_active)).map((section) => <div key={section.id}><h3 className="mb-2 text-2xl font-bold text-blue-900">{section.heading}</h3><div className="public-rich-text" dangerouslySetInnerHTML={{ __html: section.content_html }} /></div>)}</div>}</div></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</span>{children}</label>; }
function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) { return <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-700" />{label}</label>; }
function OrderButtons({ index, length, onMove }: { index: number; length: number; onMove: (direction: -1 | 1) => void }) { return <div className="flex"><button type="button" disabled={index === 0} title="Move up" onClick={() => onMove(-1)} className="rounded p-1.5 hover:bg-gray-200 disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={index === length - 1} title="Move down" onClick={() => onMove(1)} className="rounded p-1.5 hover:bg-gray-200 disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button></div>; }
function EditorButton({ title, onClick, icon }: { title: string; onClick: () => void; icon: React.ReactNode }) { return <button type="button" title={title} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="rounded border bg-white p-2 text-gray-600 hover:bg-blue-50 hover:text-blue-700">{icon}</button>; }
