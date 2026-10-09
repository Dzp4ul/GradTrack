import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  HelpCircle,
  CreditCard,
  GraduationCap,
  HandHeart,
  Contact,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import {
  type AlumniMembershipAudience,
  type AlumniMembershipContent,
  type AlumniMembershipSection,
  fetchAlumniMembership,
  resolveAlumniMembershipAsset,
} from '../services/alumniMembership';

const benefitIcons = [BadgeCheck, UsersRound, Contact, HandHeart, Building2, GraduationCap];
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-label="Loading alumni membership information">
      <div className="h-20 animate-pulse bg-slate-900" />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <div className="h-80 animate-pulse rounded-[2rem] bg-surface-muted" />
        <div className="grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl bg-surface-muted" />)}
        </div>
      </div>
    </div>
  );
}

function EmptyPage({ retry }: { retry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg rounded-3xl border border-border bg-surface p-8 text-center shadow-xl">
        <HelpCircle className="mx-auto h-12 w-12 text-amber-500" />
        <h1 className="mt-4 text-2xl font-extrabold text-text-primary">Membership information is being updated</h1>
        <p className="mt-3 leading-7 text-text-secondary">The Alumni President has not published this page yet. Please check again soon or contact the college for assistance.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link to="/" className="rounded-xl border border-border px-4 py-2.5 font-semibold text-text-primary hover:bg-surface-hover">Back to home</Link>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, eyebrow, icon: Icon, id }: { title: string; eyebrow: string; icon: typeof BadgeCheck; id?: string }) {
  return (
    <div className="mb-7 flex items-start gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-900 text-yellow-300 shadow-lg shadow-blue-900/20">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">{eyebrow}</p>
        <h2 id={id} className="mt-1 text-2xl font-black tracking-tight text-text-primary sm:text-3xl">{title}</h2>
      </div>
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
  const activeBenefits = content.benefits.filter((benefit) => benefit.is_active).sort((a, b) => a.display_order - b.display_order);
  const activeFees = content.fees.filter((fee) => fee.is_active).sort((a, b) => a.display_order - b.display_order);
  const information = content.information_sections
    .filter((item) => item.is_active && (item.audience === 'both' || item.audience === audience))
    .sort((a, b) => a.display_order - b.display_order);
  const total = activeFees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const heading = registered ? config.registered_heading : config.main_heading;
  const intro = registered ? config.registered_intro_text : config.intro_text;
  const collegeLogo = resolveAlumniMembershipAsset(config.college_logo_url || config.college_logo_path);
  const alumniLogo = resolveAlumniMembershipAsset(config.alumni_logo_url || config.alumni_logo_path);

  const renderSection = (section: AlumniMembershipSection) => {
    switch (section.section_key) {
      case 'benefits':
        return (
          <section key={section.section_key} className="rounded-[2rem] border border-border bg-surface p-5 shadow-sm sm:p-8 lg:p-10" aria-labelledby="alumni-benefits-heading">
            <SectionHeading id="alumni-benefits-heading" title={section.section_title} eyebrow="Why membership matters" icon={Sparkles} />
            {activeBenefits.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeBenefits.map((benefit, index) => {
                  const Icon = benefitIcons[index % benefitIcons.length];
                  return (
                    <article key={benefit.id ?? `${benefit.title}-${index}`} className="group relative overflow-hidden rounded-2xl border border-border bg-surface-alt p-5 transition duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg dark:hover:border-blue-700">
                      <span className="absolute right-4 top-3 text-5xl font-black text-blue-900/[0.05] dark:text-white/[0.05]">{String(index + 1).padStart(2, '0')}</span>
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="h-5 w-5" /></span>
                      <h3 className="mt-4 pr-8 text-base font-extrabold text-text-primary">{benefit.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">{benefit.description}</p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center text-text-secondary">Membership benefits are currently being updated.</div>
            )}
          </section>
        );
      case 'fees':
        return (
          <section key={section.section_key} className="overflow-hidden rounded-[2rem] border border-border bg-surface shadow-sm" aria-labelledby="alumni-fees-heading">
            <div className="grid lg:grid-cols-[0.78fr_1.22fr]">
              <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-green-500 p-7 text-white sm:p-10">
                <SectionHeading title={section.section_title} eyebrow="Transparent information" icon={CreditCard} />
                <p className="leading-7 text-emerald-50">{registered ? 'Current amounts are shown for membership reference. Existing members are not being asked to register again.' : 'Review the currently published association fees before contacting the Alumni President to proceed.'}</p>
                <div className="mt-8 rounded-2xl bg-white/15 p-5 backdrop-blur-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">Important</p>
                  <p className="mt-2 text-sm leading-6 text-white">GradTrack does not collect payment on this page. Confirm payment instructions with the Alumni President.</p>
                </div>
              </div>
              <div className="p-5 sm:p-8 lg:p-10">
                {activeFees.length > 0 ? (
                  <div className="space-y-1">
                    {activeFees.map((fee) => (
                      <div key={fee.id ?? fee.name} className="flex flex-col gap-3 border-b border-border py-5 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                        <div className="max-w-xl">
                          <h3 className="font-extrabold text-text-primary">{fee.name}</h3>
                          {fee.description && <p className="mt-1 text-sm leading-6 text-text-secondary">{fee.description}</p>}
                        </div>
                        <p className="shrink-0 text-lg font-black text-emerald-700 dark:text-emerald-300">{peso.format(Number(fee.amount))}</p>
                      </div>
                    ))}
                    {config.total_fee_enabled && (
                      <div className="mt-5 flex items-center justify-between rounded-2xl bg-blue-950 px-5 py-4 text-white">
                        <span className="font-bold">Published total</span>
                        <span className="text-2xl font-black text-yellow-300">{peso.format(total)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center">
                    <div><CreditCard className="mx-auto h-9 w-9 text-text-muted" /><p className="mt-3 font-bold text-text-primary">Membership fee information is currently being updated</p><p className="mt-1 text-sm text-text-secondary">Please contact the Alumni President for the latest information.</p></div>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      case 'id_cards': {
        const front = resolveAlumniMembershipAsset(config.id_card_front_url || config.id_card_front_path);
        const back = resolveAlumniMembershipAsset(config.id_card_back_url || config.id_card_back_path);
        return (
          <section key={section.section_key} className="rounded-[2rem] border border-border bg-surface p-5 shadow-sm sm:p-8 lg:p-10" aria-labelledby="alumni-id-heading">
            <SectionHeading id="alumni-id-heading" title={section.section_title} eyebrow="Official alumni identity" icon={Contact} />
            <p className="mb-7 max-w-3xl leading-7 text-text-secondary">Preview the official card design. Actual issuance remains subject to association verification, requirements, and applicable fees.</p>
            {front || back ? (
              <div className="grid items-start gap-6 lg:grid-cols-2">
                {[['Front', front], ['Back', back]].map(([label, image]) => image ? (
                  <figure key={label} className="min-w-0">
                    <div className="overflow-hidden rounded-[1.35rem] border border-border bg-surface-muted p-2 shadow-xl shadow-slate-950/10">
                      <img src={image} alt={`Alumni identification card ${label.toLowerCase()}`} className="aspect-[1.586/1] w-full rounded-2xl object-contain" />
                    </div>
                    <figcaption className="mt-3 text-center text-xs font-extrabold uppercase tracking-[0.18em] text-text-muted">{label} of card</figcaption>
                  </figure>
                ) : null)}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center text-text-secondary">Alumni identification card previews are currently being updated.</div>
            )}
          </section>
        );
      }
      case 'registration':
        return (
          <section key={section.section_key} className="relative overflow-hidden rounded-[2rem] bg-blue-950 p-6 text-white shadow-xl sm:p-9 lg:p-11" aria-labelledby="alumni-registration-heading">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-yellow-300/10 blur-2xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-yellow-300">Your next step</p>
                <h2 id="alumni-registration-heading" className="mt-2 text-2xl font-black sm:text-3xl">{section.section_title}</h2>
                <p className="mt-4 max-w-3xl whitespace-pre-line leading-7 text-blue-100">{registered ? config.registered_instructions : config.registration_instructions}</p>
              </div>
              {registered ? (
                <Link to="/graduate/signin" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-yellow-300 px-6 py-3 font-extrabold text-blue-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-yellow-200 focus:outline-none focus:ring-4 focus:ring-yellow-100/50">
                  Graduate Portal Sign In <ArrowRight className="h-5 w-5" />
                </Link>
              ) : (
                <a href="#membership-contact" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-yellow-300 px-6 py-3 font-extrabold text-blue-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-yellow-200 focus:outline-none focus:ring-4 focus:ring-yellow-100/50">
                  View contact instructions <ArrowRight className="h-5 w-5" />
                </a>
              )}
            </div>
          </section>
        );
      case 'additional':
        return (
          <section key={section.section_key} className="rounded-[2rem] border border-border bg-surface p-5 shadow-sm sm:p-8 lg:p-10" aria-labelledby="alumni-additional-heading">
            <SectionHeading id="alumni-additional-heading" title={section.section_title} eyebrow="Good to know" icon={ShieldCheck} />
            {information.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {information.map((item) => (
                  <article key={item.id ?? item.title} className="rounded-2xl border border-border bg-surface-alt p-5">
                    <h3 className="flex items-center gap-2 font-extrabold text-text-primary"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />{item.title}</h3>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-text-secondary">{item.content}</p>
                  </article>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-dashed border-border p-7 text-center text-text-secondary">Additional membership information is currently being updated.</div>}
          </section>
        );
      case 'contact':
        return (
          <section id="membership-contact" key={section.section_key} className="scroll-mt-24 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/40 sm:p-8" aria-labelledby="alumni-contact-heading">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white"><Mail className="h-6 w-6" /></span>
              <div>
                <h2 id="alumni-contact-heading" className="text-2xl font-black text-text-primary">{section.section_title}</h2>
                <p className="mt-3 whitespace-pre-line leading-7 text-text-secondary">{config.contact_information || 'Official contact information is currently being updated.'}</p>
              </div>
            </div>
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-text-primary">
      {preview && <div className="bg-amber-400 px-4 py-2 text-center text-sm font-extrabold text-amber-950">Draft preview — only authenticated Alumni Presidents can see this version.</div>}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-blue-950/95 text-white shadow-lg backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-300">
            <span className="flex -space-x-2">
              {collegeLogo && <img src={collegeLogo} alt="Norzagaray College logo" className="h-11 w-11 rounded-full border-2 border-white bg-white object-contain p-0.5" />}
              {alumniLogo && <img src={alumniLogo} alt="Alumni Association logo" className="h-11 w-11 rounded-full border-2 border-white bg-white object-contain p-0.5" />}
            </span>
            <span className="hidden min-w-0 sm:block"><strong className="block truncate text-sm">{config.association_name}</strong><span className="block text-xs text-blue-200">Official membership information</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/" className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-blue-100 hover:bg-white/10 sm:inline-flex"><ArrowLeft className="h-4 w-4" /> Home</Link>
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-blue-950 px-4 py-14 text-white sm:px-6 sm:py-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(250,204,21,0.18),transparent_32%),radial-gradient(circle_at_85%_70%,rgba(16,185,129,0.2),transparent_34%)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_0.72fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-yellow-200"><GraduationCap className="h-4 w-4" /> Norzagaray College Alumni</div>
              <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">{heading}</h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-blue-100 sm:text-lg">{intro}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#membership-content" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-yellow-300 px-5 py-3 font-extrabold text-blue-950 transition hover:-translate-y-0.5 hover:bg-yellow-200 focus:outline-none focus:ring-4 focus:ring-yellow-100/50">Explore membership <ArrowRight className="h-5 w-5" /></a>
                <Link to={registered ? '/alumni/membership-information' : '/alumni/registered-information'} className="inline-flex min-h-12 items-center rounded-xl border border-white/25 px-5 py-3 font-bold text-white hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/20">{registered ? 'View registration information' : 'I am already registered'}</Link>
              </div>
            </div>
            <div className="relative mx-auto flex w-full max-w-md items-center justify-center">
              <div className="absolute h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
              <div className="relative flex aspect-square w-64 items-center justify-center rounded-full border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur sm:w-80">
                {alumniLogo ? <img src={alumniLogo} alt="" className="h-full w-full object-contain drop-shadow-2xl" /> : <GraduationCap className="h-32 w-32 text-yellow-300" />}
              </div>
            </div>
          </div>
        </section>
        <div className="h-2 bg-gradient-to-r from-yellow-300 via-emerald-500 to-yellow-300" />

        <div id="membership-content" className="mx-auto max-w-7xl space-y-7 px-4 py-10 sm:px-6 sm:py-14">
          {sections.map(renderSection)}
        </div>
      </main>

      <footer className="border-t border-border bg-blue-950 px-4 py-8 text-center text-sm text-blue-100">
        <p>{config.footer_text || config.association_name}</p>
        <p className="mt-2 text-xs text-blue-300">Membership status is confirmed only through the Alumni Association’s authorized verification process.</p>
      </footer>
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
    try {
      const response = await fetchAlumniMembership(audience, preview);
      setContent(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load alumni membership information.');
    } finally {
      setLoading(false);
    }
  }, [audience, preview]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-lg rounded-3xl border border-red-200 bg-surface p-8 text-center shadow-xl dark:border-red-900">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-2xl font-extrabold text-text-primary">We couldn’t load this page</h1>
          <p className="mt-3 leading-7 text-text-secondary">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-900 px-5 py-3 font-bold text-white hover:bg-blue-800"><RefreshCw className="h-4 w-4" /> Try again</button>
        </div>
      </div>
    );
  }
  if (!content) return <EmptyPage retry={() => void load()} />;
  return <MembershipContent content={content} audience={audience} preview={preview} />;
}
