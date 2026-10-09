import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Contact,
  CreditCard,
  ExternalLink,
  HelpCircle,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import Footer from '../components/Footer';
import PublicNav from '../components/PublicNav';
import {
  fetchAlumniMembership,
  OFFICIAL_ALUMNI_REGISTRATION_URL,
  resolveAlumniMembershipAsset,
  type AlumniMembershipAudience,
  type AlumniMembershipContent,
  type AlumniMembershipSection,
} from '../services/alumniMembership';
import { hasGraduateAccountResume } from '../services/graduateAccountResume';

const brochureSectionKeys = new Set(['benefits', 'fees', 'id_cards']);
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-label="Loading alumni membership information">
      <PublicNav />
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <div className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="h-[32rem] animate-pulse rounded-3xl bg-surface-muted lg:col-span-5" />
          <div className="h-[32rem] animate-pulse rounded-3xl bg-surface-muted lg:col-span-3" />
          <div className="h-[32rem] animate-pulse rounded-3xl bg-surface-muted lg:col-span-4" />
        </div>
      </div>
      <Footer />
    </div>
  );
}

function EmptyPage({ retry }: { retry: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />
      <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 py-12">
        <div className="max-w-lg rounded-3xl border border-border bg-surface p-8 text-center shadow-xl">
          <HelpCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-2xl font-extrabold text-text-primary">Membership information is being updated</h1>
          <p className="mt-3 leading-7 text-text-secondary">The Alumni President has not published this page yet. Please check again soon.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 font-semibold text-white hover:bg-blue-800"><RefreshCw className="h-4 w-4" /> Try again</button>
            <Link to="/" className="rounded-xl border border-border px-4 py-2.5 font-semibold text-text-primary hover:bg-surface-hover">Back to home</Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function PanelHeading({ title, icon: Icon }: { title: string; icon: typeof BadgeCheck }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <h2 className="min-w-0 break-words text-base font-black uppercase leading-tight tracking-wide text-emerald-800 dark:text-emerald-300 sm:text-lg">{title}</h2>
    </div>
  );
}

function MembershipContent({ content, audience, preview }: { content: AlumniMembershipContent; audience: AlumniMembershipAudience; preview: boolean }) {
  const { config } = content;
  const registered = audience === 'registered';
  const sections = useMemo(
    () => content.section_settings.filter((section) => section.is_visible).sort((a, b) => a.display_order - b.display_order),
    [content.section_settings],
  );
  const benefits = content.benefits.filter((item) => item.is_active).sort((a, b) => a.display_order - b.display_order);
  const fees = content.fees.filter((item) => item.is_active).sort((a, b) => a.display_order - b.display_order);
  const information = content.information_sections
    .filter((item) => item.is_active && (item.audience === 'both' || item.audience === audience))
    .sort((a, b) => a.display_order - b.display_order);
  const total = fees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const heading = registered ? config.registered_heading : config.main_heading;
  const intro = registered ? config.registered_intro_text : config.intro_text;
  const collegeLogo = resolveAlumniMembershipAsset(config.college_logo_url || config.college_logo_path);
  const alumniLogo = resolveAlumniMembershipAsset(config.alumni_logo_url || config.alumni_logo_path);
  const idFront = resolveAlumniMembershipAsset(config.id_card_front_url || config.id_card_front_path);
  const idBack = resolveAlumniMembershipAsset(config.id_card_back_url || config.id_card_back_path);
  const canResumeAccount = hasGraduateAccountResume();
  const registrationEnabled = !registered && config.registration_button_enabled;
  const primarySections = sections.filter((section) => brochureSectionKeys.has(section.section_key));
  const supportingSections = sections.filter((section) => !brochureSectionKeys.has(section.section_key));

  const renderBrochureSection = (section: AlumniMembershipSection) => {
    if (section.section_key === 'benefits') {
      return (
        <section key="benefits" className="min-w-0 overflow-hidden rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/30 sm:p-7 lg:col-span-5" style={{ order: section.display_order }}>
          <PanelHeading title={section.section_title} icon={BadgeCheck} />
          <p className="mt-2 text-xs font-black uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">What&apos;s included in the alumni fee?</p>
          {benefits.length ? (
            <ol className="mt-5 space-y-3.5">
              {benefits.map((benefit, index) => (
                <li key={benefit.id ?? `${benefit.title}-${index}`} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-black text-white">{index + 1}</span>
                  <div className="min-w-0 pt-0.5"><h3 className="break-words text-sm font-extrabold leading-5 text-emerald-950 dark:text-emerald-100">{benefit.title}</h3><p className="mt-0.5 break-words text-xs leading-5 text-emerald-900/75 dark:text-emerald-100/75">{benefit.description}</p></div>
                </li>
              ))}
            </ol>
          ) : <div className="mt-5 rounded-2xl border border-dashed border-emerald-300 p-6 text-center text-sm text-text-secondary">Membership benefits are currently being updated.</div>}
        </section>
      );
    }

    if (section.section_key === 'fees') {
      return (
        <section key="fees" className="min-w-0 overflow-hidden rounded-3xl border-2 border-emerald-500 bg-surface p-5 shadow-[0_16px_40px_rgba(5,150,105,0.12)] sm:p-6 lg:col-span-3" style={{ order: section.display_order }}>
          <PanelHeading title={section.section_title} icon={CreditCard} />
          <p className="mt-3 text-xs leading-5 text-text-secondary">Current published Alumni Association fees.</p>
          {fees.length ? (
            <div className="mt-5">
              <div className="divide-y divide-border">
                {fees.map((fee) => (
                  <div key={fee.id ?? fee.name} className="py-4 first:pt-0">
                    <div className="flex min-w-0 items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-extrabold leading-5 text-text-primary">{fee.name}</h3><p className="shrink-0 text-sm font-black text-emerald-700 dark:text-emerald-300">{peso.format(Number(fee.amount))}</p></div>
                    {fee.description && <p className="mt-1 text-xs leading-5 text-text-secondary">{fee.description}</p>}
                  </div>
                ))}
              </div>
              {config.total_fee_enabled && <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-emerald-700 px-4 py-4 text-white"><span className="text-sm font-black uppercase tracking-wider">Total</span><span className="text-xl font-black text-yellow-300">{peso.format(total)}</span></div>}
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">GradTrack displays information only and does not collect membership payments.</p>
            </div>
          ) : <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">Membership fee information is currently being updated.</div>}
        </section>
      );
    }

    if (section.section_key === 'id_cards') {
      return (
        <section key="id_cards" className="min-w-0 overflow-hidden rounded-3xl border border-blue-100 bg-blue-50/60 p-5 dark:border-blue-900 dark:bg-blue-950/25 sm:p-7 lg:col-span-4" style={{ order: section.display_order }}>
          <PanelHeading title={section.section_title} icon={Contact} />
          <p className="mt-2 text-xs leading-5 text-text-secondary">Official card preview. Issuance remains subject to Alumni Association verification.</p>
          {idFront || idBack ? (
            <div className="mt-5 space-y-5">
              {[['Front', idFront], ['Back', idBack]].map(([label, image]) => image ? (
                <figure key={label} className="relative overflow-hidden rounded-2xl bg-white p-2 shadow-lg ring-1 ring-blue-100 dark:bg-slate-900 dark:ring-blue-900">
                  <span className="absolute left-4 top-4 z-10 rounded-full bg-emerald-700 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-md">{label}</span>
                  <img src={image} alt={`Alumni identification card ${label.toLowerCase()}`} className="aspect-[1.586/1] w-full rounded-xl object-contain" />
                </figure>
              ) : null)}
            </div>
          ) : <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">Card previews are currently being updated.</div>}
        </section>
      );
    }
    return null;
  };

  const renderSupportingSection = (section: AlumniMembershipSection) => {
    if (section.section_key === 'registration') {
      return (
        <section key="registration" className="overflow-hidden rounded-3xl border border-blue-800 bg-blue-950 text-white shadow-xl">
          <div className="grid lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">Official registration</p><h2 className="mt-2 text-2xl font-black">{section.section_title}</h2><p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-blue-100">{registered ? config.registered_instructions : config.registration_instructions}</p></div>
            <div className="border-t border-white/10 bg-blue-900/70 p-6 lg:w-80 lg:border-l lg:border-t-0">
              {registered ? (
                <Link to="/survey-verify" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-yellow-300 px-5 py-3 text-center font-extrabold text-blue-950 hover:bg-yellow-200">Continue to Graduate Portal <ArrowRight className="h-5 w-5" /></Link>
              ) : registrationEnabled ? (
                <><a href={OFFICIAL_ALUMNI_REGISTRATION_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-yellow-300 px-5 py-3 text-center font-extrabold text-blue-950 hover:bg-yellow-200">{config.registration_button_text || 'Proceed to Alumni Registration'} <ExternalLink className="h-5 w-5" /></a><p className="mt-2 text-center text-xs leading-5 text-blue-200">Opens the official Google Form in a new tab.</p></>
              ) : <p className="rounded-xl border border-white/20 bg-white/10 p-4 text-center text-sm text-blue-100">Online registration is temporarily unavailable.</p>}
            </div>
          </div>
        </section>
      );
    }

    if (section.section_key === 'additional') {
      return (
        <section key="additional" className="rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-800 dark:text-blue-300" /><h2 className="text-xl font-black text-text-primary">{section.section_title}</h2></div>
          {information.length ? <div className="mt-5 grid gap-4 md:grid-cols-2">{information.map((item) => <article key={item.id ?? item.title} className="rounded-2xl border border-border bg-surface-alt p-5"><h3 className="flex items-center gap-2 font-extrabold text-text-primary"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />{item.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-text-secondary">{item.content}</p></article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center text-text-secondary">Additional information is currently being updated.</div>}
        </section>
      );
    }

    if (section.section_key === 'contact') {
      return (
        <section id="membership-contact" key="contact" className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white"><Mail className="h-5 w-5" /></span><div><h2 className="text-xl font-black text-text-primary">{section.section_title}</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-text-secondary">{config.contact_information || 'Official contact information is currently being updated.'}</p></div></div>
        </section>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-text-primary">
      <PublicNav />
      {preview && <div className="bg-amber-400 px-4 py-2 text-center text-sm font-extrabold text-amber-950">Draft preview — only authenticated Alumni Presidents can see this version.</div>}
      <main className="overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(37,99,235,0.08),transparent_30%)] px-4 py-7 sm:px-6 sm:py-10">
        <div className="mx-auto min-w-0 max-w-7xl">
          <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-blue-800 hover:text-blue-600 dark:text-blue-300"><ArrowLeft className="h-4 w-4" /> Back to GradTrack home</Link>
          <article className="min-w-0 max-w-full overflow-hidden rounded-[2rem] border border-border bg-surface shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
            <header className="relative overflow-hidden border-b border-border px-5 py-7 sm:px-8 lg:px-10">
              <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(16,185,129,0.08),transparent_45%,rgba(37,99,235,0.08))]" />
              <div className="relative grid min-w-0 gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
                <div className="flex items-center gap-3">{collegeLogo && <img src={collegeLogo} alt="Norzagaray College logo" className="h-14 w-14 rounded-full bg-white p-1 object-contain shadow-sm sm:h-16 sm:w-16" />}{alumniLogo && <img src={alumniLogo} alt="Alumni Association logo" className="h-14 w-14 rounded-full bg-white p-1 object-contain shadow-sm sm:h-16 sm:w-16" />}</div>
                <div className="min-w-0"><p className="break-words text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">{config.association_name}</p><h1 className="mt-2 break-words text-2xl font-black uppercase leading-tight tracking-tight text-blue-950 dark:text-blue-100 sm:text-3xl lg:text-4xl">{heading}</h1><p className="mt-2 max-w-4xl break-words text-sm leading-6 text-text-secondary sm:text-base">{intro}</p>{config.membership_subtitle && <p className="mt-3 break-words text-xs font-bold uppercase tracking-[0.14em] text-text-muted">{config.membership_subtitle}</p>}</div>
              </div>
            </header>
            <div className="grid min-w-0 gap-5 bg-surface-alt p-4 sm:p-6 lg:grid-cols-12 lg:p-8">{primarySections.map(renderBrochureSection)}</div>
          </article>

          <div className="mt-6 space-y-5">
            {supportingSections.map(renderSupportingSection)}
            {canResumeAccount && <section className="flex flex-col gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/40 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-extrabold text-blue-950 dark:text-blue-100">Ready to continue with your GradTrack account?</p><p className="mt-1 text-sm leading-6 text-blue-800 dark:text-blue-200">Your completed survey remains saved. Continue account creation without answering it again.</p></div><Link to="/survey-verify?resume=graduate-account&step=create-account" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-900 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-800">Continue account creation <ArrowRight className="h-4 w-4" /></Link></section>}
          </div>
        </div>
      </main>
      <div className="border-t border-border bg-surface px-4 py-5 text-center text-sm text-text-secondary"><p>{config.footer_text || config.association_name}</p><p className="mt-1 text-xs text-text-muted">Membership status is confirmed only through the Alumni Association&apos;s authorized process.</p></div>
      <Footer />
    </div>
  );
}

export default function AlumniMembershipPage({ audience }: { audience: AlumniMembershipAudience }) {
  const [searchParams] = useSearchParams();
  const preview = searchParams.get('preview') === 'draft';
  const [content, setContent] = useState<AlumniMembershipContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setContent((await fetchAlumniMembership(audience, preview)).data); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load alumni membership information.'); }
    finally { setLoading(false); }
  }, [audience, preview]);

  useEffect(() => { void load(); }, [load]);
  if (loading) return <PageSkeleton />;
  if (error) return <div className="min-h-screen bg-background"><PublicNav /><div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 py-12"><div className="max-w-lg rounded-3xl border border-red-200 bg-surface p-8 text-center shadow-xl dark:border-red-900"><AlertCircle className="mx-auto h-12 w-12 text-red-500" /><h1 className="mt-4 text-2xl font-extrabold text-text-primary">We couldn&apos;t load this page</h1><p className="mt-3 leading-7 text-text-secondary">{error}</p><button type="button" onClick={() => void load()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-900 px-5 py-3 font-bold text-white hover:bg-blue-800"><RefreshCw className="h-4 w-4" /> Try again</button></div></div><Footer /></div>;
  if (!content) return <EmptyPage retry={() => void load()} />;
  return <MembershipContent content={content} audience={audience} preview={preview} />;
}
