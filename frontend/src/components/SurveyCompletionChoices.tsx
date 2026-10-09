import type { Ref } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  GraduationCap,
  Info,
} from 'lucide-react';

interface SurveyCompletionChoicesProps {
  backgroundImage: string;
  logoSrc: string;
  onCreateAccount: () => void;
  onBackToVerification: () => void;
  initialFocusRef?: Ref<HTMLHeadingElement>;
  overlay?: boolean;
}

const BenefitItem = ({ children, tone }: { children: string; tone: 'emerald' | 'blue' }) => (
  <li className="flex items-start gap-2.5 text-sm font-medium leading-6 text-[#334155]">
    <span
      className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white ${
        tone === 'emerald' ? 'bg-emerald-600' : 'bg-blue-600'
      }`}
      aria-hidden="true"
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
    </span>
    <span>{children}</span>
  </li>
);

export default function SurveyCompletionChoices({
  backgroundImage,
  logoSrc,
  onCreateAccount,
  onBackToVerification,
  initialFocusRef,
  overlay = false,
}: SurveyCompletionChoicesProps) {
  return (
    <main
      className={`${overlay ? 'fixed inset-0 z-[9998]' : 'relative min-h-[100svh]'} isolate overflow-x-hidden overflow-y-auto bg-slate-950`}
    >
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${backgroundImage})` }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[76rem] flex-col justify-center px-3 py-5 sm:px-6 sm:py-7 lg:px-8">
        <header className="mb-4 flex justify-center sm:mb-5">
          <img
            src={logoSrc}
            alt="GradTrack — Norzagaray College"
            className="h-auto max-h-[4.5rem] w-auto max-w-[17rem] object-contain drop-shadow-[0_4px_10px_rgba(15,23,42,0.4)] sm:max-w-[21rem]"
          />
        </header>

        <section
          className="overflow-hidden rounded-[1.75rem] border border-[rgba(255,255,255,0.7)] bg-[rgba(255,255,255,0.92)] shadow-[0_30px_80px_rgba(15,23,42,0.34)] backdrop-blur-2xl"
          aria-labelledby="post-survey-opportunity-heading"
        >
          <div className="px-5 pb-6 pt-6 text-center sm:px-8 sm:pb-7 sm:pt-7 lg:px-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-4 py-2 text-sm font-extrabold text-[#047857] shadow-[0_8px_20px_rgba(5,150,105,0.12)]">
              <CheckCircle2 className="h-5 w-5 fill-emerald-600 text-white" strokeWidth={2.5} aria-hidden="true" />
              <span>Survey Completed</span>
            </div>

            <h1
              ref={initialFocusRef}
              tabIndex={-1}
              id="post-survey-opportunity-heading"
              className="mx-auto mt-4 max-w-4xl text-[2rem] font-black leading-[1.08] tracking-[-0.035em] text-[#0b1748] sm:text-[2.65rem] lg:text-[3rem]"
            >
              Your Next <span className="text-[#1d4ed8]">Opportunity</span> Starts Here<span className="text-[#f59e0b]">!</span>
            </h1>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-[#475569] sm:text-base sm:leading-7">
              Create your GradTrack account to discover exciting job opportunities, connect with fellow alumni, and
              open doors to your future career.
            </p>
          </div>

          <div className="grid items-stretch gap-4 px-4 pb-6 sm:px-7 sm:pb-7 md:grid-cols-2 lg:gap-5 lg:px-10">
            <article className="group relative flex h-full min-h-[25rem] flex-col overflow-hidden rounded-3xl border border-[#a7f3d0] bg-[linear-gradient(135deg,#ffffff_0%,#ecfdf5_58%,#d1fae5_100%)] p-5 shadow-[0_14px_35px_rgba(5,150,105,0.09)] transition duration-300 hover:-translate-y-1 hover:border-[#6ee7b7] hover:shadow-[0_20px_45px_rgba(5,150,105,0.16)] sm:p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-700/20 ring-1 ring-white/70">
                <GraduationCap className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
              </div>
              <p className="mt-5 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#047857]">
                Step 01 <span className="text-emerald-400">·</span> Alumni Membership
              </p>
              <h2 className="mt-2 text-[1.45rem] font-black leading-tight tracking-[-0.02em] text-[#0b1748] sm:text-[1.65rem]">
                Become an Official Alumni Member
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#475569]">
                Stay connected to your alma mater! Complete your official Alumni Association registration and become
                part of the Norzagaray College alumni network.
              </p>
              <ul className="mt-4 space-y-1.5" aria-label="Alumni membership benefits">
                <BenefitItem tone="emerald">Connect with fellow alumni</BenefitItem>
                <BenefitItem tone="emerald">Enjoy alumni membership benefits</BenefitItem>
                <BenefitItem tone="emerald">Be officially recognized as an alumni member</BenefitItem>
              </ul>
              <Link
                to="/alumni/membership-information"
                className="mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-600 px-5 py-3 text-center text-sm font-extrabold text-white shadow-lg shadow-emerald-700/20 transition duration-200 hover:-translate-y-0.5 hover:from-emerald-800 hover:to-emerald-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-200 sm:text-base"
              >
                Register as Alumni Member
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </article>

            <article className="group relative flex h-full min-h-[25rem] flex-col overflow-hidden rounded-3xl border border-[#bfdbfe] bg-[linear-gradient(135deg,#ffffff_0%,#eff6ff_58%,#dbeafe_100%)] p-5 shadow-[0_14px_35px_rgba(37,99,235,0.1)] transition duration-300 hover:-translate-y-1 hover:border-[#93c5fd] hover:shadow-[0_20px_45px_rgba(37,99,235,0.17)] sm:p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-700/25 ring-1 ring-white/70">
                <Briefcase className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
              </div>
              <p className="mt-5 text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#1d4ed8]">
                Step 02 <span className="text-amber-500">·</span> GradTrack Portal
              </p>
              <h2 className="mt-2 text-[1.45rem] font-black leading-tight tracking-[-0.02em] text-[#0b1748] sm:text-[1.65rem]">
                Your Career Journey Continues Here!
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#475569]">
                Looking for your next opportunity? Create your GradTrack account to explore job openings, connect with
                fellow graduates, and stay updated with the alumni community.
              </p>
              <ul className="mt-4 space-y-1.5" aria-label="GradTrack portal benefits">
                <BenefitItem tone="blue">Discover job opportunities</BenefitItem>
                <BenefitItem tone="blue">Connect through the alumni community forum</BenefitItem>
                <BenefitItem tone="blue">Stay informed about alumni news and updates</BenefitItem>
              </ul>
              <button
                type="button"
                onClick={onCreateAccount}
                className="mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-3 text-center text-sm font-extrabold text-white shadow-lg shadow-blue-700/20 transition duration-200 hover:-translate-y-0.5 hover:from-blue-800 hover:to-blue-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-200 sm:text-base"
              >
                Create My GradTrack Account
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </article>
          </div>

          <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#e2e8f0] bg-[rgba(255,255,255,0.58)] px-5 py-4 text-center sm:flex-row sm:px-8 sm:text-left lg:px-10">
            <p className="flex items-start gap-2 text-xs font-medium leading-5 text-[#64748b] sm:text-sm">
              <Info className="mt-0.5 hidden h-4 w-4 shrink-0 text-[#94a3b8] sm:block" aria-hidden="true" />
              <span>Alumni registration and GradTrack account access are processed separately.</span>
            </p>
            <button
              type="button"
              onClick={onBackToVerification}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-extrabold text-[#1d4ed8] transition hover:bg-[#eff6ff] hover:text-[#1e40af] focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Verification
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
