import React from 'react';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {interpolate, useCurrentFrame} from 'remotion';
import {AnimatedCursor, typedText} from '../animations/AnimatedCursor';
import {
  CampusBackdrop,
  DemoStage,
  GradTrackLogo,
  PrimaryButton,
  STAGE,
  SuccessNotice,
  Surface,
  stageX,
  stageY,
} from '../components/AccurateUI';
import {springLike} from '../components/Primitives';

const inputStyle: React.CSSProperties = {
  height: 50,
  borderRadius: 9,
  border: '1px solid #cbd5e1',
  background: '#fff',
  padding: '0 16px',
  display: 'flex',
  alignItems: 'center',
  color: '#0f172a',
  fontSize: 13,
};

const FormLabel: React.FC<{label: string; value?: string; placeholder?: string; active?: boolean; wide?: boolean}> = ({label, value, placeholder, active, wide}) => (
  <label style={{fontSize: 12.5, fontWeight: 750, color: '#111827', gridColumn: wide ? '1 / -1' : undefined}}>
    {label}
    <div style={{...inputStyle, marginTop: 7, borderColor: active ? '#2563eb' : '#cbd5e1', boxShadow: active ? '0 0 0 3px rgba(37,99,235,.13)' : 'none'}}>
      {value || <span style={{color: '#94a3b8'}}>{placeholder}</span>}
    </div>
  </label>
);

const VerificationCard: React.FC<{frame: number}> = ({frame}) => {
  const student = typedText('2025-0000', frame, 42, .55);
  const lastName = typedText('Dela Cruz', frame, 105, .5);
  const programSelected = frame >= 188;
  const verifying = frame >= 276;
  return (
    <>
      <div style={{position: 'absolute', left: 0, right: 0, top: 28, display: 'flex', justifyContent: 'center'}}><GradTrackLogo width={365} /></div>
      <Surface style={{position: 'absolute', width: 520, left: (STAGE.width - 520) / 2, top: 120, padding: '31px 32px 28px', borderRadius: 18}}>
        <div style={{width: 72, height: 72, borderRadius: 999, margin: '0 auto', display: 'grid', placeItems: 'center', background: '#2f6be9', color: '#fff'}}><ShieldCheck size={38} /></div>
        <h1 style={{fontSize: 25, color: '#1e3a8a', textAlign: 'center', margin: '27px 0 0', fontWeight: 900}}>Graduate Tracer Survey</h1>
        <div style={{textAlign: 'center', color: '#64748b', fontSize: 12, marginTop: 8}}>Survey: <span style={{color: '#2563eb', fontWeight: 750}}>Graduate Tracer Study Survey</span></div>
        <p style={{fontSize: 12.5, lineHeight: 1.55, color: '#475569', textAlign: 'center', margin: '14px 16px 0'}}>Please verify your identity to access the active graduate tracer survey.</p>
        <div style={{marginTop: 20, padding: '15px 16px', borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'flex-start', gap: 11, color: '#334155', fontSize: 12, lineHeight: 1.45}}><AlertCircle size={18} color="#2563eb" />Enter your information exactly as it appears in the registrar records.</div>
        <div style={{fontSize: 12.5, fontWeight: 800, marginTop: 21}}>Verify Using</div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 9}}>
          <PrimaryButton style={{width: '100%'}}>Student Number</PrimaryButton>
          <PrimaryButton muted style={{width: '100%', color: '#1d4ed8', borderColor: '#60a5fa'}}>Email</PrimaryButton>
        </div>
        <div style={{display: 'grid', gap: 15, marginTop: 18}}>
          <FormLabel label="Student Number *" value={student} placeholder="2XXX-XXXX" active={frame >= 32 && frame < 96} />
          <FormLabel label="Last Name *" value={lastName} placeholder="Enter your last name" active={frame >= 96 && frame < 165} />
          <FormLabel label="Program *" value={programSelected ? 'Bachelor of Science in Computer Science' : ''} placeholder="Select your program" active={frame >= 165 && frame < 214} />
        </div>
        <PrimaryButton style={{width: '100%', marginTop: 18, height: 49}}>{verifying ? 'Verifying...' : 'Verify & Continue'}</PrimaryButton>
      </Surface>
      {frame >= 300 && <SuccessNotice title="Identity verified" message="Your graduate record was matched. The active tracer survey is ready." start={300} />}
    </>
  );
};

export const VerifyIdentityScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  return (
    <DemoStage duration={duration} label="Verify your graduate identity" url="localhost:5173/survey-verify">
      <CampusBackdrop><VerificationCard frame={frame} /></CampusBackdrop>
      <AnimatedCursor points={[
        {frame: 8, x: stageX(1420), y: stageY(190)},
        {frame: 28, x: stageX(918), y: stageY(570)},
        {frame: 36, x: stageX(918), y: stageY(570), click: true},
        {frame: 96, x: stageX(918), y: stageY(658)},
        {frame: 104, x: stageX(918), y: stageY(658), click: true},
        {frame: 162, x: stageX(918), y: stageY(746)},
        {frame: 170, x: stageX(918), y: stageY(746), click: true},
        {frame: 204, x: stageX(918), y: stageY(746)},
        {frame: 248, x: stageX(918), y: stageY(810)},
        {frame: 260, x: stageX(918), y: stageY(810), click: true},
        {frame: 286, x: stageX(918), y: stageY(810)},
        {frame: 332, x: stageX(1515), y: stageY(838)},
      ]} />
    </DemoStage>
  );
};

const surveySections = [
  {title: 'PERSONAL INFORMATION', short: 'Personal Information'},
  {title: 'EDUCATIONAL BACKGROUND', short: 'Educational Background'},
  {title: 'EMPLOYMENT DATA', short: 'Employment Data'},
  {title: 'CAREER ALIGNMENT & EXPERIENCE', short: 'Career & Experience'},
  {title: 'REVIEW YOUR RESPONSES', short: 'Review'},
];

const SurveyHeader: React.FC<{active: number}> = ({active}) => (
  <>
    <div style={{height: 64, background: '#224495', color: '#fff', display: 'flex', alignItems: 'center'}}>
      <div style={{width: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}><GradTrackLogo markOnly width={42} /><b style={{fontSize: 18}}>GradTrack Survey</b></div>
        <div style={{fontSize: 13, fontWeight: 750}}>← Back to Home</div>
      </div>
    </div>
    <div style={{height: 39, background: 'rgba(30,64,175,.82)', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', padding: '0 330px', color: '#dbeafe'}}>
      {surveySections.map((section, index) => <div key={section.short} style={{display: 'grid', placeItems: 'center', borderBottom: index === active ? '3px solid #f8c331' : '3px solid transparent', color: index === active ? '#fde047' : '#dbeafe', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{section.short}</div>)}
    </div>
  </>
);

const SurveyField: React.FC<{label: string; value: string; selected?: boolean}> = ({label, value, selected}) => (
  <label style={{display: 'block', fontSize: 12.5, fontWeight: 800, color: '#0f172a'}}>{label}<div style={{...inputStyle, marginTop: 8, height: 45, borderColor: selected ? '#2563eb' : '#cbd5e1', background: selected ? '#eff6ff' : '#fff'}}>{value}</div></label>
);

const PersonalPage = () => <div style={{display: 'grid', gap: 20}}>
  <div style={{padding: 20, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16}}>
    <SurveyField label="1. Last Name *" value="Dela Cruz" /><SurveyField label="2. First Name *" value="Juan" /><SurveyField label="3. Middle Name" value="Santos" /><SurveyField label="4. Name Extension" value="Select an option⌄" />
  </div>
  <div style={{padding: 20, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16}}>
    <SurveyField label="Region *" value="Region III (Central Luzon)" /><SurveyField label="Province *" value="Bulacan" /><SurveyField label="City/Municipality *" value="Norzagaray" /><SurveyField label="Barangay *" value="Poblacion" />
  </div>
  <div style={{padding: 20, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16}}>
    <SurveyField label="9. Email Address *" value="juan.delacruz.demo@example.com" /><SurveyField label="10. Mobile Number *" value="+63 900 000 0000" /><SurveyField label="11. Telephone or Contact Number" value="Not provided" />
  </div>
</div>;

const EducationPage = () => <div style={{display: 'grid', gap: 20}}>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 18}}><SurveyField label="Degree / Program *" value="Bachelor of Science in Computer Science" selected /><SurveyField label="Year Graduated *" value="2025" /><SurveyField label="Honors / Awards" value="Dean's Lister" /></div>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}><SurveyField label="Professional Examination Passed" value="None" /><SurveyField label="Year Taken" value="Not applicable" /></div>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff'}}><b style={{fontSize: 13}}>Trainings and Professional Development</b><p style={{fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 0}}>Web Development Fundamentals · Career Readiness Workshop · Portfolio Building</p></div>
</div>;

const EmploymentPage = () => <div style={{display: 'grid', gap: 20}}>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff'}}><b style={{fontSize: 13}}>Are you currently employed? *</b><div style={{display: 'flex', gap: 14, marginTop: 16}}><PrimaryButton style={{minWidth: 150}}>Yes, employed</PrimaryButton><PrimaryButton muted style={{minWidth: 150}}>Not employed</PrimaryButton></div></div>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18}}><SurveyField label="Current Position / Job Title *" value="Software Developer" /><SurveyField label="Company Name *" value="Northstar Digital Solutions" /><SurveyField label="Employment Location *" value="Local" /></div>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}><SurveyField label="Employment Type" value="Full-time / Permanent" /><SurveyField label="Monthly Income Range" value="₱25,000 – ₱35,000" /></div>
</div>;

const AlignmentPage = () => <div style={{display: 'grid', gap: 20}}>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff'}}><b style={{fontSize: 13}}>Is your present job related to the course or program you completed? *</b><div style={{display: 'flex', gap: 14, marginTop: 16}}><PrimaryButton style={{minWidth: 145}}>Yes, aligned</PrimaryButton><PrimaryButton muted style={{minWidth: 145}}>No</PrimaryButton></div></div>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}><SurveyField label="Time before landing first job" value="Within 6 months" /><SurveyField label="Primary reason for accepting the job" value="Career growth and skills alignment" /></div>
  <div style={{padding: 22, borderRadius: 14, border: '1px solid #bfdbfe', background: '#eff6ff'}}><SurveyField label="Which college competencies have been most useful in your work?" value="Technical foundations, teamwork, problem solving, and communication" /></div>
</div>;

const ReviewPage = () => <div style={{display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 17}}>
  {[['Personal Information','Juan Santos Dela Cruz · Norzagaray, Bulacan'],['Education','BS Computer Science · Batch 2025'],['Employment','Employed · Software Developer'],['Course Alignment','Current work is aligned with completed program']].map(([title,value]) => <div key={title} style={{padding: 20, borderRadius: 14, border: '1px solid #dbe3ef', background: '#f8fafc'}}><div style={{fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4, color: '#64748b', fontWeight: 850}}>{title}</div><div style={{fontSize: 14, marginTop: 8, fontWeight: 750}}>{value}</div></div>)}
</div>;

const SurveyPanel: React.FC<{frame: number}> = ({frame}) => {
  const active = frame < 150 ? 0 : frame < 300 ? 1 : frame < 450 ? 2 : frame < 570 ? 3 : 4;
  const submitted = frame >= 625;
  const pages = [<PersonalPage />, <EducationPage />, <EmploymentPage />, <AlignmentPage />, <ReviewPage />];
  return (
    <CampusBackdrop>
      <SurveyHeader active={active} />
      <Surface style={{position: 'absolute', width: 1400, left: (STAGE.width - 1400) / 2, top: 120, minHeight: 730, padding: '27px 32px 26px', borderRadius: 16}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
          <div><h1 style={{margin: 0, fontSize: 24, color: '#1e3a8a'}}>Graduate Tracer Study Survey</h1><div style={{fontSize: 13, color: '#16a34a', fontWeight: 800, marginTop: 8}}>Welcome, Juan Dela Cruz!</div><div style={{fontSize: 13, color: '#475569', marginTop: 9}}>Comprehensive survey for tracking graduate employment and career outcomes</div></div>
          <div style={{display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', fontSize: 12}}><Save size={16} /> Draft saved</div>
        </div>
        <div style={{height: 61, borderRadius: 13, background: '#2860db', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 18px', fontSize: 18, fontWeight: 900, letterSpacing: .4, marginTop: 20}}>{surveySections[active].title}</div>
        <div style={{marginTop: 24}}>{pages[active]}</div>
        <div style={{position: 'absolute', left: 32, right: 32, bottom: 25, paddingTop: 19, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between'}}>
          <PrimaryButton muted style={{minWidth: 130, opacity: active === 0 ? .45 : 1}}><ChevronLeft size={17} /> Previous</PrimaryButton>
          <PrimaryButton style={{minWidth: active === 4 ? 165 : 125, background: active === 4 ? '#16a34a' : '#2563eb', borderColor: active === 4 ? '#16a34a' : '#2563eb'}}>{active === 4 ? 'Submit Survey' : <>Next <ChevronRight size={17} /></>}</PrimaryButton>
        </div>
      </Surface>
      {submitted && (
        <div style={{position: 'absolute', inset: 0, background: 'rgba(2,6,23,.58)', display: 'grid', placeItems: 'center'}}>
          <Surface style={{width: 650, padding: '36px 40px', textAlign: 'center', borderRadius: 20, opacity: springLike(frame, 625, 20), transform: `scale(${.94 + springLike(frame,625,20) * .06})`}}>
            <div style={{width: 82, height: 82, margin: '0 auto', borderRadius: 999, display: 'grid', placeItems: 'center', background: '#dcfce7', color: '#16a34a'}}><CheckCircle2 size={48} /></div>
            <h2 style={{fontSize: 26, color: '#166534', margin: '22px 0 0'}}>Survey submitted successfully</h2>
            <p style={{fontSize: 14, color: '#64748b', lineHeight: 1.65, margin: '13px auto 0', maxWidth: 510}}>Your graduate tracer response has been recorded. You can now create your Graduate Portal account.</p>
            <div style={{marginTop: 24, display: 'flex', justifyContent: 'center'}}><PrimaryButton style={{minWidth: 220}}>Create Account Now</PrimaryButton></div>
          </Surface>
        </div>
      )}
    </CampusBackdrop>
  );
};

export const TracerSurveyScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  return (
    <DemoStage duration={duration} label="Complete the Graduate Tracer Survey" url="localhost:5173/survey">
      <SurveyPanel frame={frame} />
      <AnimatedCursor points={[
        {frame: 12, x: stageX(510), y: stageY(505)},
        {frame: 32, x: stageX(555), y: stageY(505), click: true},
        {frame: 110, x: stageX(1532), y: stageY(804)},
        {frame: 126, x: stageX(1532), y: stageY(804), click: true},
        {frame: 165, x: stageX(680), y: stageY(465)},
        {frame: 180, x: stageX(680), y: stageY(465), click: true},
        {frame: 260, x: stageX(1532), y: stageY(804)},
        {frame: 276, x: stageX(1532), y: stageY(804), click: true},
        {frame: 320, x: stageX(612), y: stageY(480)},
        {frame: 338, x: stageX(612), y: stageY(480), click: true},
        {frame: 410, x: stageX(1532), y: stageY(804)},
        {frame: 426, x: stageX(1532), y: stageY(804), click: true},
        {frame: 468, x: stageX(608), y: stageY(475)},
        {frame: 485, x: stageX(608), y: stageY(475), click: true},
        {frame: 535, x: stageX(1532), y: stageY(804)},
        {frame: 550, x: stageX(1532), y: stageY(804), click: true},
        {frame: 600, x: stageX(1512), y: stageY(804)},
        {frame: 615, x: stageX(1512), y: stageY(804), click: true},
        {frame: 680, x: stageX(918), y: stageY(690)},
      ]} />
    </DemoStage>
  );
};

const AccountCard: React.FC<{frame: number}> = ({frame}) => {
  const email = typedText('juan.delacruz.demo@example.com', frame, 98, .75);
  const password = typedText('••••••••••••', frame, 165, .6);
  const confirm = typedText('••••••••••••', frame, 220, .6);
  const submitting = frame >= 305 && frame < 338;
  return (
    <CampusBackdrop>
      <div style={{position: 'absolute', left: 0, right: 0, top: 26, display: 'flex', justifyContent: 'center'}}><GradTrackLogo width={330} /></div>
      <Surface style={{position: 'absolute', width: 650, left: (STAGE.width - 650) / 2, top: 110, padding: '27px 32px 25px', borderRadius: 18}}>
        <div style={{width: 68, height: 68, borderRadius: 999, background: '#2563eb', color: '#fff', margin: '0 auto', display: 'grid', placeItems: 'center'}}><UserPlus size={36} /></div>
        <h1 style={{textAlign: 'center', color: '#1e3a8a', fontSize: 24, margin: '20px 0 0'}}>Create Graduate Portal Account</h1>
        <p style={{textAlign: 'center', fontSize: 12.5, color: '#64748b', lineHeight: 1.55, margin: '10px 35px 0'}}>Your survey is complete. Review your details and set a password to create your portal account.</p>
        <div style={{marginTop: 18, padding: 14, borderRadius: 10, background: '#eff6ff', color: '#334155', display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.45}}><AlertCircle size={18} color="#2563eb" />Your identity is verified. Your survey details will be used to prepare your graduate profile.</div>
        <div style={{marginTop: 16, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '13px 15px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 18px', fontSize: 11.5, color: '#475569'}}>
          <div><b>Name:</b> Juan Dela Cruz</div><div><b>Program:</b> BS Computer Science</div><div><b>Year Graduated:</b> 2025</div><div><b>Contact:</b> +63 900 000 0000</div>
        </div>
        <div style={{display: 'grid', gap: 14, marginTop: 17}}>
          <FormLabel label="Email Address *" value={email} placeholder="e.g., juan@email.com" active={frame >= 88 && frame < 156} />
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14}}><FormLabel label="Password *" value={password} placeholder="Min 8 chars, Aa1!" active={frame >= 156 && frame < 212} /><FormLabel label="Confirm Password *" value={confirm} placeholder="Re-enter password" active={frame >= 212 && frame < 282} /></div>
        </div>
        <div style={{fontSize: 10.5, color: '#64748b', marginTop: 10}}>Password must include uppercase, lowercase, number, and symbol.</div>
        <PrimaryButton style={{width: '100%', marginTop: 15, height: 48}}>{submitting ? 'Creating Account...' : 'Create Account'}</PrimaryButton>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: 14, textAlign: 'center', fontSize: 11.5, fontWeight: 750}}><span style={{color: '#2563eb'}}>Back to verification</span><span style={{color: '#64748b', textDecoration: 'underline'}}>Already have an account?</span></div>
      </Surface>
      {frame >= 338 && <SuccessNotice title="Account created" message="Your Graduate Portal account was submitted for verification." start={338} />}
    </CampusBackdrop>
  );
};

export const CreateAccountScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  return (
    <DemoStage duration={duration} label="Create your Graduate Portal account" url="localhost:5173/survey">
      <AccountCard frame={frame} />
      <AnimatedCursor points={[
        {frame: 10, x: stageX(1400), y: stageY(180)},
        {frame: 78, x: stageX(918), y: stageY(598)},
        {frame: 88, x: stageX(918), y: stageY(598), click: true},
        {frame: 150, x: stageX(770), y: stageY(679)},
        {frame: 160, x: stageX(770), y: stageY(679), click: true},
        {frame: 208, x: stageX(1064), y: stageY(679)},
        {frame: 218, x: stageX(1064), y: stageY(679), click: true},
        {frame: 282, x: stageX(918), y: stageY(700)},
        {frame: 298, x: stageX(918), y: stageY(700), click: true},
        {frame: 324, x: stageX(918), y: stageY(700)},
        {frame: 368, x: stageX(1510), y: stageY(842)},
      ]} />
    </DemoStage>
  );
};
