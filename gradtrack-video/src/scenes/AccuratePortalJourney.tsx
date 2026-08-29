import React from 'react';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  CheckCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  Heart,
  ImagePlus,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {AnimatedCursor, typedText} from '../animations/AnimatedCursor';
import {
  AccuratePortal,
  AccuratePortalTab,
  DemoAvatar,
  DemoStage,
  GradTrackLogo,
  PortalPageTitle,
  PrimaryButton,
  SuccessNotice,
  Surface,
  stageX,
  stageY,
} from '../components/AccurateUI';
import {springLike} from '../components/Primitives';

const announcementItems = [
  {title: 'New Alumni Partnership and Exclusive Benefits', date: 'Aug 28, 2026', category: 'Alumni Opportunity', summary: 'Discover new partner benefits, career connections, and opportunities created for Norzagaray College graduates.', image: true},
  {title: 'Graduate Career Readiness Workshop', date: 'Aug 25, 2026', category: 'Career', summary: 'Join a practical workshop on résumés, interviews, portfolios, and building a strong professional profile.'},
  {title: 'Alumni Homecoming 2026', date: 'Aug 20, 2026', category: 'College Activity', summary: 'Reconnect with classmates and celebrate the growing Norzagaray College alumni community.'},
];

const AnnouncementImage: React.FC<{real?: boolean}> = ({real}) => real ? (
  <Img src={staticFile('assets/announcement-partnership.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
) : (
  <div style={{height: '100%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)', color: '#fff'}}><div style={{textAlign: 'center'}}><Megaphone size={48} /><div style={{fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 2.2, marginTop: 12, fontWeight: 900}}>GradTrack Announcement</div></div></div>
);

const AnnouncementList: React.FC = () => (
  <>
    <PortalPageTitle icon={<Megaphone size={24} />} title="Announcements" subtitle="Read updates, alumni opportunities, events, and college activities." />
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20}}>
      {announcementItems.map((item, index) => (
        <Surface key={item.title} style={{borderRadius: 27, overflow: 'hidden'}}>
          <div style={{height: 215}}><AnnouncementImage real={item.image} /></div>
          <div style={{padding: '19px 21px 18px'}}>
            <div style={{display: 'flex', gap: 16, color: '#64748b', fontSize: 10.5, fontWeight: 750}}><span><CalendarDays size={13} style={{verticalAlign: 'middle', marginRight: 6}} />{item.date}</span><span style={{color: '#b45309'}}>{item.category}</span></div>
            <h2 style={{fontSize: 18, lineHeight: 1.35, minHeight: 50, margin: '15px 0 0'}}>{item.title}</h2>
            <p style={{fontSize: 11.5, lineHeight: 1.65, color: '#64748b', minHeight: 58, margin: '8px 0 0'}}>{item.summary}</p>
            <div style={{display: 'flex', alignItems: 'center', gap: 9, borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 13}}><DemoAvatar initials="NC" size={34} /><div style={{flex: 1}}><div style={{fontSize: 10.5, fontWeight: 850}}>Norzagaray College</div><div style={{fontSize: 9.5, color: '#94a3b8'}}>Official announcement</div></div><span style={{fontSize: 10.5, fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: .5}}>Read More</span></div>
          </div>
        </Surface>
      ))}
    </div>
  </>
);

const AnnouncementDetail: React.FC<{frame: number}> = ({frame}) => (
  <div style={{opacity: springLike(frame, 185, 18)}}>
    <div style={{display: 'inline-flex', alignItems: 'center', gap: 7, color: '#1d4ed8', fontSize: 12.5, fontWeight: 850, marginBottom: 13}}><ArrowLeft size={16} /> Back to Announcements</div>
    <div style={{display: 'grid', gridTemplateColumns: '1fr 300px', gap: 30, alignItems: 'start'}}>
      <article>
        <div style={{height: 390, overflow: 'hidden', borderRadius: 10}}><AnnouncementImage real /></div>
        <h1 style={{fontSize: 28, lineHeight: 1.2, margin: '20px 0 0'}}>New Alumni Partnership and Exclusive Benefits</h1>
        <div style={{display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #e2e8f0', padding: '13px 0 15px', color: '#64748b', fontSize: 11.5}}><DemoAvatar initials="NC" size={34} /><b style={{color: '#334155'}}>Norzagaray College</b><span>August 28, 2026</span><span>Alumni Opportunity</span></div>
        <p style={{fontSize: 13, lineHeight: 1.75, color: '#475569'}}>GradTrack keeps graduates informed about college activities, career services, alumni programs, and opportunities that support continued professional growth.</p>
      </article>
      <aside>
        <div style={{borderBottom: '2px solid #1d4ed8', paddingBottom: 10, fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase'}}>Announcement Categories</div>
        {['All Announcements','Alumni Opportunity','Career','College Activity'].map((label, index) => <div key={label} style={{display: 'flex', justifyContent: 'space-between', padding: '13px 10px', borderBottom: '1px solid #eef2f7', background: '#fff', fontSize: 11.5, fontWeight: 700}}><span>{label}</span><span style={{color: '#1d4ed8'}}>{index === 0 ? 3 : 1}</span></div>)}
        <div style={{borderBottom: '2px solid #1d4ed8', padding: '26px 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase'}}>Recent Announcements</div>
        {announcementItems.slice(1).map((item) => <div key={item.title} style={{display: 'flex', gap: 10, padding: '12px 4px', borderBottom: '1px solid #eef2f7', background: '#fff'}}><div style={{width: 70, height: 52, borderRadius: 6, overflow: 'hidden'}}><AnnouncementImage /></div><div><div style={{fontSize: 10.5, lineHeight: 1.35, fontWeight: 800}}>{item.title}</div><div style={{fontSize: 9, color: '#94a3b8', marginTop: 5}}>{item.date}</div></div></div>)}
      </aside>
    </div>
  </div>
);

export const AccurateAnnouncementsScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const detail = frame >= 185;
  return (
    <DemoStage duration={duration} label="Stay connected with Norzagaray College" url={detail ? 'localhost:5173/graduate/announcements/1' : 'localhost:5173/graduate/announcements'}>
      <AccuratePortal active="Announcements">{detail ? <AnnouncementDetail frame={frame} /> : <AnnouncementList />}</AccuratePortal>
      <AnimatedCursor points={[
        {frame: 10, x: stageX(1120), y: stageY(185)},
        {frame: 118, x: stageX(590), y: stageY(630)},
        {frame: 145, x: stageX(590), y: stageY(630), click: true},
        {frame: 175, x: stageX(590), y: stageY(630)},
        {frame: 230, x: stageX(610), y: stageY(420)},
        {frame: 320, x: stageX(1495), y: stageY(480)},
      ]} />
    </DemoStage>
  );
};

const CommunityPost: React.FC<{mine?: boolean}> = ({mine}) => (
  <Surface style={{borderRadius: 28, overflow: 'hidden'}}>
    <div style={{padding: '18px 21px 14px', display: 'flex', justifyContent: 'space-between'}}><div style={{display: 'flex', gap: 10, alignItems: 'center'}}><DemoAvatar initials={mine ? 'JD' : 'MS'} size={42} /><div><div style={{fontSize: 12.5, fontWeight: 900}}>{mine ? 'Juan Dela Cruz' : 'Maria Santos'}</div><div style={{fontSize: 10, color: '#64748b', marginTop: 3}}>BSCS · {mine ? 'Just now' : '2h ago'}</div></div></div><div style={{display: 'flex', alignItems: 'center', gap: 10}}><span style={{padding: '6px 10px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: 10, fontWeight: 800}}>Career Tips</span><MoreHorizontal size={17} color="#94a3b8" /></div></div>
    <div style={{padding: '0 21px 17px'}}><h3 style={{fontSize: 18, margin: '3px 0 8px'}}>{mine ? 'Portfolio tips for graduating students' : 'What helped me prepare for my first developer interview'}</h3><p style={{fontSize: 11.5, lineHeight: 1.65, color: '#475569', margin: 0}}>{mine ? 'Start with one polished project, explain the problem you solved, and keep your résumé focused on measurable outcomes.' : 'Focus on the fundamentals, explain your thought process clearly, and bring one project you are genuinely proud of.'}</p>{mine && <div style={{height: 125, borderRadius: 14, marginTop: 13, overflow: 'hidden'}}><Img src={staticFile('assets/norzagaray-campus.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover'}} /></div>}</div>
    <div style={{borderTop: '1px solid #f1f5f9', padding: '12px 21px', display: 'flex', gap: 25, color: '#475569', fontSize: 11, fontWeight: 750}}><span><Heart size={15} style={{verticalAlign: 'middle', marginRight: 7}} />{mine ? 0 : 28}</span><span><MessageCircle size={15} style={{verticalAlign: 'middle', marginRight: 7}} />{mine ? 0 : 9} comments</span></div>
  </Surface>
);

const CommunityComposer: React.FC<{frame: number}> = ({frame}) => {
  const title = typedText('Portfolio tips for graduating students', frame, 155, .75);
  const content = typedText('Start with one polished project, explain the problem you solved, and keep your résumé focused on measurable outcomes.', frame, 220, 1.05);
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', opacity: springLike(frame, 135, 16)}}>
      <Surface style={{width: 760, padding: 25, borderRadius: 28}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}><div><h2 style={{fontSize: 23, margin: 0}}>Create Community Post</h2><p style={{fontSize: 12, color: '#64748b', margin: '6px 0 0'}}>Share something useful with the GradTrack alumni community.</p></div><X size={20} color="#64748b" /></div>
        <label style={{display: 'block', fontSize: 11.5, fontWeight: 800, marginTop: 20}}>Post Title<div style={{height: 45, borderRadius: 12, border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', padding: '0 14px', marginTop: 7, fontSize: 12}}>{title}</div></label>
        <label style={{display: 'block', fontSize: 11.5, fontWeight: 800, marginTop: 14}}>Content<div style={{height: 96, borderRadius: 12, border: '1px solid #cbd5e1', padding: '13px 14px', marginTop: 7, fontSize: 12, lineHeight: 1.5}}>{content}</div></label>
        <div style={{height: 92, borderRadius: 13, border: '1px dashed #60a5fa', background: '#eff6ff', marginTop: 14, display: 'flex', alignItems: 'center', gap: 13, padding: 9}}><Img src={staticFile('assets/norzagaray-campus.jpg')} style={{width: 115, height: 72, objectFit: 'cover', borderRadius: 9}} /><div><div style={{fontSize: 11.5, fontWeight: 850, color: '#1e3a8a'}}>campus-career-tips.jpg</div><div style={{fontSize: 9.5, color: '#64748b', marginTop: 4}}>Image attached · Ready to upload</div></div><ImagePlus size={20} color="#2563eb" style={{marginLeft: 'auto', marginRight: 10}} /></div>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18}}><span style={{fontSize: 10.5, color: '#64748b'}}>Posts are checked against community guidelines.</span><div style={{display: 'flex', gap: 9}}><PrimaryButton muted pill>Cancel</PrimaryButton><PrimaryButton pill>{frame >= 330 ? 'Checking Post...' : 'Submit Post'}</PrimaryButton></div></div>
      </Surface>
    </div>
  );
};

export const AccurateCommunityScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const composing = frame >= 135 && frame < 355;
  const published = frame >= 355;
  return (
    <DemoStage duration={duration} label="Connect with the GradTrack alumni community" url="localhost:5173/graduate/portal?tab=community_forum">
      <div style={{height: '100%', position: 'relative'}}>
        <AccuratePortal active="Community Forum">
          <PortalPageTitle icon={<MessageCircle size={24} />} title="Community Forum" subtitle="Share experiences, ask questions, react, comment, and connect with fellow graduates." />
          <Surface style={{padding: 16, marginBottom: 15}}><div style={{display: 'flex', alignItems: 'center', gap: 12}}><DemoAvatar size={43} /><div style={{height: 43, flex: 1, display: 'flex', alignItems: 'center', padding: '0 18px', borderRadius: 999, background: '#f5f7fb', color: '#94a3b8', fontSize: 11.5}}>Share a career tip, experience, or question with fellow graduates...</div><PrimaryButton pill><Plus size={15} /> Create Post</PrimaryButton><PrimaryButton muted pill>Manage My Posts</PrimaryButton></div></Surface>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18}}><div>{published ? <CommunityPost mine /> : <CommunityPost />}</div><div><Surface style={{padding: 18, background: '#eff6ff', borderColor: '#bfdbfe'}}><b style={{fontSize: 12.5, color: '#172554'}}>Community Announcement</b><p style={{fontSize: 11, lineHeight: 1.55, color: '#1e40af', marginBottom: 0}}>Welcome to the GradTrack Community Forum.</p></Surface><Surface style={{padding: 18, marginTop: 14}}><b style={{fontSize: 12.5}}>Community Guidelines</b><p style={{fontSize: 11, lineHeight: 1.55, color: '#64748b', marginBottom: 0}}>Keep discussions respectful, relevant, and helpful for fellow Norzagaray College alumni.</p></Surface><Surface style={{padding: 18, marginTop: 14}}><b style={{fontSize: 12.5}}>Chats</b><p style={{fontSize: 10.5, color: '#64748b'}}>Direct and group conversations inside the forum.</p><div style={{display: 'flex', gap: 8}}><PrimaryButton muted pill style={{height: 36}}>New Chat</PrimaryButton><PrimaryButton pill style={{height: 36}}>Group Chat</PrimaryButton></div></Surface></div></div>
        </AccuratePortal>
        {composing && <CommunityComposer frame={frame} />}
        {published && <SuccessNotice title="Post published" message="Your post is now visible in the Community Forum." start={355} />}
      </div>
      <AnimatedCursor points={[
        {frame: 10, x: stageX(720), y: stageY(315)},
        {frame: 103, x: stageX(1410), y: stageY(244)},
        {frame: 118, x: stageX(1410), y: stageY(244), click: true},
        {frame: 148, x: stageX(905), y: stageY(385)},
        {frame: 156, x: stageX(905), y: stageY(385), click: true},
        {frame: 210, x: stageX(905), y: stageY(495)},
        {frame: 220, x: stageX(905), y: stageY(495), click: true},
        {frame: 315, x: stageX(1210), y: stageY(664)},
        {frame: 330, x: stageX(1210), y: stageY(664), click: true},
        {frame: 380, x: stageX(650), y: stageY(560)},
        {frame: 430, x: stageX(1510), y: stageY(840)},
      ]} />
    </DemoStage>
  );
};

const conversationRows = [
  {name: 'Maria Santos', initials: 'MS', preview: 'Happy to help with your application.', time: '10:42 AM'},
  {name: 'Paolo Reyes', initials: 'PR', preview: 'I sent the workshop details.', time: 'Yesterday'},
  {name: 'Ana Rivera', initials: 'AR', preview: 'See you at the homecoming!', time: 'Tuesday'},
];

const ChatWorkspace: React.FC<{frame: number; group?: boolean; created?: boolean}> = ({frame, group, created}) => {
  const draft = group ? '' : typedText('Thank you! I will review the application link today.', frame, 135, .8);
  const sent = !group && frame >= 275;
  const title = group ? (created ? 'BSCS Career Circle' : 'BSCS Alumni 2025') : 'Maria Santos';
  return (
    <Surface style={{height: 690, overflow: 'hidden', borderRadius: 10, display: 'grid', gridTemplateColumns: '360px 1fr'}}>
      <div style={{borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column'}}>
        <div style={{padding: 16, borderBottom: '1px solid #e2e8f0'}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><b style={{fontSize: 16}}>{group ? 'Group Chats' : 'Conversations'}</b><PrimaryButton pill style={{height: 36, padding: '0 13px'}}><Plus size={13} /> {group ? 'Create Group' : 'New Message'}</PrimaryButton></div><div style={{height: 39, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', color: '#94a3b8', fontSize: 11, marginTop: 13}}><Search size={14} /> Search chats</div></div>
        <div style={{padding: 10}}>{(group ? [{name: created ? 'BSCS Career Circle' : 'BSCS Alumni 2025', initials: created ? 'BC' : '25', preview: created ? 'Group chat created' : 'Ana: See you at the homecoming!', time: created ? 'Now' : 'Tue'}, {name: 'Tech Alumni Network', initials: 'TN', preview: 'Paolo: Workshop starts at 2 PM.', time: 'Mon'}] : conversationRows).map((item,index) => <div key={item.name} style={{display: 'flex', gap: 10, alignItems: 'center', padding: '12px 11px', borderRadius: 9, background: index === 0 ? '#eff6ff' : 'transparent', border: index === 0 ? '1px solid #bfdbfe' : '1px solid transparent'}}><DemoAvatar initials={item.initials} size={39} /><div style={{minWidth: 0, flex: 1}}><div style={{display: 'flex', justifyContent: 'space-between'}}><b style={{fontSize: 11}}>{item.name}</b><span style={{fontSize: 8.5, color: '#94a3b8'}}>{item.time}</span></div><div style={{fontSize: 9.5, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{item.preview}</div></div></div>)}</div>
      </div>
      <div style={{display: 'grid', gridTemplateRows: '65px 1fr 75px', minWidth: 0}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 11, padding: '0 18px', borderBottom: '1px solid #e2e8f0'}}><DemoAvatar initials={group ? (created ? 'BC' : '25') : 'MS'} size={41} /><div><div style={{fontSize: 12.5, fontWeight: 900}}>{title}</div><div style={{fontSize: 9.5, color: group ? '#64748b' : '#059669'}}>{group ? (created ? '3 participants' : '18 participants') : '● Online'}</div></div></div>
        <div style={{padding: 22, background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12}}>
          {group ? <><div style={{alignSelf: 'flex-start', maxWidth: 470, borderRadius: '14px 14px 14px 4px', background: '#fff', border: '1px solid #e2e8f0', padding: '12px 14px', fontSize: 11.5}}>Welcome to {title}. Let’s share career leads and alumni activities here.<div style={{fontSize: 8.5, color: '#94a3b8', marginTop: 5}}>Maria · 10:30 AM</div></div>{created && <div style={{alignSelf: 'center', borderRadius: 999, padding: '8px 13px', background: '#eff6ff', color: '#1d4ed8', fontSize: 10.5, fontWeight: 800}}>You created “BSCS Career Circle”</div>}</> : <><div style={{alignSelf: 'flex-start', maxWidth: 480, borderRadius: '14px 14px 14px 4px', background: '#fff', border: '1px solid #e2e8f0', padding: '12px 14px', fontSize: 11.5, lineHeight: 1.5}}>Hi Juan! The junior developer role is still open. The application link is in Browse Jobs.<div style={{fontSize: 8.5, color: '#94a3b8', marginTop: 5}}>10:42 AM</div></div>{sent && <div style={{alignSelf: 'flex-end', maxWidth: 480, borderRadius: '14px 14px 4px 14px', background: '#1d4ed8', color: '#fff', padding: '12px 14px', fontSize: 11.5, lineHeight: 1.5, opacity: springLike(frame, 275, 15)}}>Thank you! I will review the application link today.<div style={{fontSize: 8.5, color: '#bfdbfe', textAlign: 'right', marginTop: 5}}>10:44 AM · ✓✓</div></div>}</>}
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 9, padding: '12px 15px', borderTop: '1px solid #e2e8f0'}}><Paperclip size={18} color="#64748b" /><div style={{height: 44, flex: 1, display: 'flex', alignItems: 'center', padding: '0 14px', border: '1px solid #cbd5e1', borderRadius: 9, background: '#f8fafc', color: draft ? '#0f172a' : '#94a3b8', fontSize: 11.5}}>{sent ? '' : draft || 'Type a message'}</div><div style={{width: 44, height: 44, borderRadius: 9, display: 'grid', placeItems: 'center', background: '#1d4ed8', color: '#fff'}}><Send size={17} /></div></div>
      </div>
    </Surface>
  );
};

export const AccurateMessagesScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  return (
    <DemoStage duration={duration} label="Message fellow graduates" url="localhost:5173/graduate/portal?tab=messages">
      <AccuratePortal active="Messages"><PortalPageTitle icon={<MessageCircle size={24} />} title="Messages" subtitle="Continue one-on-one conversations with fellow graduates." /><ChatWorkspace frame={frame} /></AccuratePortal>
      <AnimatedCursor points={[
        {frame: 10, x: stageX(375), y: stageY(342)},
        {frame: 54, x: stageX(365), y: stageY(342), click: true},
        {frame: 118, x: stageX(1205), y: stageY(834)},
        {frame: 130, x: stageX(1205), y: stageY(834), click: true},
        {frame: 245, x: stageX(1625), y: stageY(834)},
        {frame: 263, x: stageX(1625), y: stageY(834), click: true},
        {frame: 320, x: stageX(1280), y: stageY(675)},
        {frame: 372, x: stageX(1480), y: stageY(490)},
      ]} />
    </DemoStage>
  );
};

const GroupCreator: React.FC<{frame: number}> = ({frame}) => {
  const name = typedText('BSCS Career Circle', frame, 118, .7);
  const selectedOne = frame >= 205;
  const selectedTwo = frame >= 240;
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center', background: 'rgba(15,23,42,.56)', opacity: springLike(frame, 82, 15)}}>
      <Surface style={{width: 780, borderRadius: 28, overflow: 'hidden'}}>
        <div style={{padding: '22px 25px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between'}}><div><h2 style={{fontSize: 23, margin: 0}}>Create Group Chat</h2><p style={{fontSize: 12, color: '#64748b', margin: '6px 0 0'}}>Choose multiple graduates and give your chat a name.</p></div><X size={20} color="#64748b" /></div>
        <div style={{padding: '18px 25px'}}>
          <div style={{display: 'flex', gap: 8}}><PrimaryButton muted pill style={{height: 36}}>Direct</PrimaryButton><PrimaryButton pill style={{height: 36}}>Group</PrimaryButton></div>
          <label style={{display: 'block', fontSize: 11.5, fontWeight: 800, marginTop: 16}}>Group Chat Name *<div style={{height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderRadius: 12, border: '1px solid #cbd5e1', marginTop: 7, fontSize: 12}}>{name}</div></label>
          <div style={{height: 42, display: 'flex', alignItems: 'center', gap: 9, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 14px', color: '#94a3b8', fontSize: 11, marginTop: 14}}><Search size={15} /> Search graduates</div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginTop: 13}}>{[{name:'Maria Santos',meta:'BSCS · Batch 2024',selected:selectedOne,initials:'MS'},{name:'Paolo Reyes',meta:'BSCS · Batch 2023',selected:selectedTwo,initials:'PR'},{name:'Ana Rivera',meta:'ACT · Batch 2025',selected:false,initials:'AR'},{name:'Liza Cruz',meta:'BSCS · Batch 2022',selected:false,initials:'LC'}].map((p) => <div key={p.name} style={{height: 63, display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px', borderRadius: 13, border: `1px solid ${p.selected ? '#93c5fd' : '#e2e8f0'}`, background: p.selected ? '#eff6ff' : '#fff'}}><div style={{width: 17, height: 17, borderRadius: 4, border: `1px solid ${p.selected ? '#2563eb' : '#cbd5e1'}`, background: p.selected ? '#2563eb' : '#fff', color: '#fff', display: 'grid', placeItems: 'center'}}>{p.selected && <Check size={12} />}</div><DemoAvatar initials={p.initials} size={36} /><div><div style={{fontSize: 11.5, fontWeight: 850}}>{p.name}</div><div style={{fontSize: 9.5, color: '#64748b', marginTop: 3}}>{p.meta}</div></div></div>)}</div>
        </div>
        <div style={{padding: '16px 25px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 9}}><PrimaryButton muted pill>Cancel</PrimaryButton><PrimaryButton pill>Create Group Chat</PrimaryButton></div>
      </Surface>
    </div>
  );
};

export const AccurateGroupChatScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const modal = frame >= 82 && frame < 330;
  const created = frame >= 330;
  return (
    <DemoStage duration={duration} label="Create and coordinate group chats" url="localhost:5173/graduate/portal?tab=group_chats">
      <div style={{height: '100%', position: 'relative'}}><AccuratePortal active="Group Chats"><PortalPageTitle icon={<Users size={24} />} title="Group Chats" subtitle="Create or revisit group conversations for alumni coordination." /><ChatWorkspace frame={frame} group created={created} /></AccuratePortal>{modal && <GroupCreator frame={frame} />}{created && <SuccessNotice title="Group chat created" message="BSCS Career Circle is ready for your selected graduates." start={330} />}</div>
      <AnimatedCursor points={[
        {frame: 10, x: stageX(450), y: stageY(238)},
        {frame: 63, x: stageX(450), y: stageY(238), click: true},
        {frame: 108, x: stageX(918), y: stageY(392)},
        {frame: 116, x: stageX(918), y: stageY(392), click: true},
        {frame: 188, x: stageX(575), y: stageY(534)},
        {frame: 200, x: stageX(575), y: stageY(534), click: true},
        {frame: 224, x: stageX(985), y: stageY(534)},
        {frame: 236, x: stageX(985), y: stageY(534), click: true},
        {frame: 286, x: stageX(1200), y: stageY(696)},
        {frame: 306, x: stageX(1200), y: stageY(696), click: true},
        {frame: 350, x: stageX(1170), y: stageY(620)},
        {frame: 425, x: stageX(1505), y: stageY(842)},
      ]} />
    </DemoStage>
  );
};

const JobCard: React.FC<{index: number}> = ({index}) => {
  const job = index === 0 ? {person:'Paolo Reyes',initials:'PR',program:'BSCS · Posted Apr 19',type:'Part Time',company:'Northstar Learning Hub',title:'Teacher Trainer',description:'Support training sessions and help learners build practical digital skills.',location:'Makati City',fit:'BSED',salary:'₱25,000 – ₱30,000',email:'careers.demo@example.com',deadline:'No deadline specified'} : {person:'Kim Reyes',initials:'KR',program:'BSCS · Posted Apr 16',type:'Contract',company:'Northstar Digital Solutions',title:'Business Development Manager',description:'Monitor market trends, build partnerships, and identify emerging opportunities.',location:'Quezon City',fit:'BSCS',salary:'₱25,000 – ₱30,000',email:'jobs.demo@example.com',deadline:'Deadline Sep 30, 2026'};
  return (
    <Surface style={{padding: 24, borderRadius: 27, minHeight: 455, display: 'flex', flexDirection: 'column'}}>
      <div style={{display: 'flex', justifyContent: 'space-between'}}><div style={{display: 'flex', alignItems: 'center', gap: 11}}><DemoAvatar initials={job.initials} size={47} /><div><div style={{fontSize: 12.5, fontWeight: 900}}>{job.person}</div><div style={{fontSize: 9.5, color: '#64748b', marginTop: 3}}>{job.program}</div></div></div><span style={{height: 28, padding: '0 12px', borderRadius: 999, display: 'grid', placeItems: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: 10, fontWeight: 750}}>{job.type}</span></div>
      <div style={{marginTop: 20, color: '#64748b', fontSize: 11.5, fontWeight: 750}}><Building2 size={15} color="#2563eb" style={{verticalAlign: 'middle', marginRight: 7}} />{job.company}</div>
      <h2 style={{fontSize: 21, margin: '9px 0 0'}}>{job.title}</h2><p style={{fontSize: 11.5, color: '#475569', lineHeight: 1.6, minHeight: 55}}>{job.description}</p>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6}}>{[[MapPin,'Location',job.location],[GraduationCap,'Program Fit',job.fit],[Briefcase,'Salary',job.salary]].map(([Icon,label,value]: any) => <span key={label} style={{height: 32, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 999, border: '1px solid #dbe3ef', color: '#475569', fontSize: 9.5}}><Icon size={13} color="#2563eb" /><span style={{color: '#64748b'}}>{label}:</span> <b>{value}</b></span>)}</div>
      <div style={{borderTop: '1px solid #f1f5f9', marginTop: 18, paddingTop: 14}}><div style={{fontSize: 9.5, textTransform: 'uppercase', letterSpacing: .8, color: '#94a3b8', fontWeight: 900}}>How to Apply</div><div style={{display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 11, color: '#1d4ed8', fontSize: 11.5, fontWeight: 750}}><span><Mail size={14} style={{verticalAlign: 'middle', marginRight: 6}} />{job.email}</span><span><FileText size={14} style={{verticalAlign: 'middle', marginRight: 6}} />Application link</span></div></div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 18}}><span style={{fontSize: 10.5, color: '#94a3b8'}}>{job.deadline}</span><PrimaryButton pill style={{height: 39}}><FileText size={14} /> View Details</PrimaryButton></div>
    </Surface>
  );
};

export const AccurateJobsScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const searched = typedText('developer', frame, 60, .55);
  const opened = frame >= 315;
  return (
    <DemoStage duration={duration} label="Browse graduate job opportunities" url="localhost:5173/graduate/portal?tab=jobs">
      <div style={{height: '100%', position: 'relative'}}><AccuratePortal active="Browse Jobs">
        <Surface style={{padding: 20, borderRadius: 28, marginBottom: 18}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}><div><h1 style={{fontSize: 24, margin: 0}}>Browse Jobs</h1><p style={{fontSize: 12, color: '#64748b', margin: '5px 0 0'}}>Approved job opportunities stay separate from Community Forum discussions.</p></div><span style={{padding: '9px 15px', borderRadius: 999, background: '#f1f5f9', fontSize: 11.5, fontWeight: 800}}>3 jobs</span></div><div style={{height: 45, display: 'flex', alignItems: 'center', gap: 9, borderRadius: 14, border: '1px solid #dbe3ef', background: '#fafbff', padding: '0 15px', marginTop: 15, fontSize: 11.5, color: searched ? '#0f172a' : '#94a3b8'}}><Search size={16} color="#94a3b8" />{searched || 'Search jobs by title, company, skills, location, or program fit'}</div></Surface>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 19}}><JobCard index={0} /><JobCard index={1} /></div>
      </AccuratePortal>{opened && <SuccessNotice title="Application link opened" message="GradTrack opens the employer-provided application page in a new tab." start={315} />}</div>
      <AnimatedCursor points={[
        {frame: 10, x: stageX(700), y: stageY(210)},
        {frame: 45, x: stageX(850), y: stageY(271)},
        {frame: 55, x: stageX(850), y: stageY(271), click: true},
        {frame: 150, x: stageX(1190), y: stageY(644)},
        {frame: 230, x: stageX(435), y: stageY(650)},
        {frame: 282, x: stageX(466), y: stageY(596)},
        {frame: 302, x: stageX(466), y: stageY(596), click: true},
        {frame: 350, x: stageX(1510), y: stageY(842)},
        {frame: 404, x: stageX(1320), y: stageY(680)},
      ]} />
    </DemoStage>
  );
};

const InfoRow: React.FC<{label: string; value: string}> = ({label, value}) => <div style={{marginTop: 16}}><div style={{fontSize: 9.5, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5}}>{label}</div><div style={{fontSize: 11.5, fontWeight: 700, color: '#0f172a', marginTop: 5, lineHeight: 1.45}}>{value}</div></div>;

const ProfileHero = () => (
  <Surface style={{overflow: 'hidden', borderRadius: 28}}>
    <div style={{height: 255, position: 'relative', background: 'linear-gradient(110deg,#071735,#123a7a 68%,#0f172a)'}}><div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 40, opacity: .18}}><GradTrackLogo markOnly width={150} /></div><div style={{position: 'absolute', left: 30, top: 22, display: 'flex', alignItems: 'center', gap: 10, color: '#fff'}}><div style={{width: 38, height: 38, borderRadius: 10, background: '#fff', padding: 5}}><GradTrackLogo markOnly width={28} /></div><div><div style={{fontSize: 10.5, color: '#f8c331', fontWeight: 850, textTransform: 'uppercase', letterSpacing: 1.5}}>GradTrack Alumni</div><div style={{fontSize: 10, marginTop: 3}}>Norzagaray College</div></div></div><div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: 7, background: '#f8c331'}} /></div>
    <div style={{height: 248, position: 'relative', padding: '76px 32px 24px'}}>
      <div style={{position: 'absolute', left: 31, top: -64, width: 122, height: 122, borderRadius: 999, background: '#fff', padding: 5, boxShadow: '0 6px 18px rgba(15,23,42,.2)'}}><DemoAvatar initials="JD" size={112} /><div style={{position: 'absolute', right: 0, bottom: 4, width: 35, height: 35, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid #e2e8f0'}}><Camera size={15} /></div></div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}><div><div style={{display: 'flex', gap: 9}}><span style={{height: 28, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 11px', borderRadius: 999, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 10.5, fontWeight: 850}}><ShieldCheck size={14} /> Verified Alumni</span><span style={{height: 28, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 11px', borderRadius: 999, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', fontSize: 10.5, fontWeight: 850}}><CalendarDays size={14} /> Batch 2025</span></div><h1 style={{fontSize: 30, margin: '16px 0 0'}}>Juan Dela Cruz</h1><div style={{fontSize: 12.5, color: '#475569', fontWeight: 650, marginTop: 9}}>Bachelor of Science in Computer Science - Batch 2025 - Software Developer</div><div style={{fontSize: 12, color: '#1d4ed8', fontWeight: 750, marginTop: 11}}>Software Developer</div><div style={{fontSize: 11.5, color: '#475569', marginTop: 11}}><MapPin size={14} style={{verticalAlign: 'middle', marginRight: 7, color: '#94a3b8'}} />Norzagaray, Bulacan</div></div><PrimaryButton pill><Pencil size={15} /> Edit Profile</PrimaryButton></div>
    </div>
  </Surface>
);

const ProfileSummary = () => <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 19}}>
  <Surface style={{padding: 23, minHeight: 330}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><h2 style={{fontSize: 17, margin: 0}}>Contacts</h2><PrimaryButton muted pill style={{height: 33, padding: '0 13px'}}>Edit</PrimaryButton></div><InfoRow label="Email Address" value="juan.delacruz.demo@example.com" /><InfoRow label="Phone Number" value="+63 900 000 0000" /><InfoRow label="Current Location" value="Norzagaray, Bulacan" /></Surface>
  <Surface style={{padding: 23, minHeight: 330}}><h2 style={{fontSize: 17, margin: 0}}>Information</h2><InfoRow label="Full Name" value="Juan Santos Dela Cruz" /><InfoRow label="Birthday" value="June 12, 2003" /><InfoRow label="Civil Status" value="Single" /><InfoRow label="Sex / Gender" value="Male" /></Surface>
  <Surface style={{padding: 23, minHeight: 330}}><div style={{display: 'flex', justifyContent: 'space-between'}}><h2 style={{fontSize: 17, margin: 0}}>Work</h2><PrimaryButton muted pill style={{height: 33, padding: '0 13px'}}>View</PrimaryButton></div><div style={{display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 999, marginTop: 18, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: 10.5, fontWeight: 850}}><CheckCircle2 size={14} /> Currently Employed</div><InfoRow label="Current Position / Job Title" value="Software Developer" /><InfoRow label="Company Name" value="Northstar Digital Solutions" /><InfoRow label="Employment Location" value="Local" /></Surface>
</div>;

const LowerProfile = () => <>
  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 19}}><Surface style={{padding: 24, minHeight: 260}}><div style={{display: 'flex', alignItems: 'center', gap: 10}}><GraduationCap size={21} color="#2563eb" /><h2 style={{fontSize: 18, margin: 0}}>Education</h2></div><InfoRow label="Degree / Program" value="Bachelor of Science in Computer Science" /><InfoRow label="Institution" value="Norzagaray College" /><InfoRow label="Year Graduated" value="2025" /></Surface><Surface style={{padding: 24, minHeight: 260}}><div style={{display: 'flex', alignItems: 'center', gap: 10}}><Briefcase size={21} color="#2563eb" /><h2 style={{fontSize: 18, margin: 0}}>Trainings & Professional Development</h2></div><InfoRow label="Recent Training" value="Career Readiness and Portfolio Building Workshop" /><InfoRow label="Provider" value="Norzagaray College" /><InfoRow label="Year Completed" value="2025" /></Surface></div>
  <Surface style={{padding: 24, minHeight: 300}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><div><h2 style={{fontSize: 19, margin: 0}}>Community Forum Posts</h2><p style={{fontSize: 11, color: '#64748b', margin: '5px 0 0'}}>Career experiences and tips shared with fellow graduates.</p></div><span style={{padding: '8px 12px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 10.5, fontWeight: 850}}>1 post</span></div><div style={{marginTop: 17, borderRadius: 18, border: '1px solid #e2e8f0', padding: 18}}><div style={{display: 'flex', alignItems: 'center', gap: 9}}><DemoAvatar size={38} /><div><b style={{fontSize: 11.5}}>Juan Dela Cruz</b><div style={{fontSize: 9.5, color: '#64748b'}}>BSCS · Career Tips</div></div></div><h3 style={{fontSize: 16, margin: '13px 0 7px'}}>Portfolio tips for graduating students</h3><p style={{fontSize: 11, lineHeight: 1.6, color: '#64748b'}}>Start with one polished project and explain the problem you solved.</p></div></Surface>
</>;

export const AccurateProfileScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [90, 465], [0, 860], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <DemoStage duration={duration} label="Review and update your graduate profile" url="localhost:5173/graduate/portal?tab=my_profile">
      <AccuratePortal active="My Profile" scroll={scroll} showScrollbar><div style={{display: 'grid', gap: 20}}><ProfileHero /><ProfileSummary /><LowerProfile /></div></AccuratePortal>
      <AnimatedCursor points={[
        {frame: 12, x: stageX(1565), y: stageY(545)},
        {frame: 70, x: stageX(1722), y: stageY(790)},
        {frame: 145, x: stageX(1778), y: stageY(740)},
        {frame: 255, x: stageX(1778), y: stageY(610)},
        {frame: 365, x: stageX(1778), y: stageY(470)},
        {frame: 470, x: stageX(1778), y: stageY(335)},
        {frame: 525, x: stageX(1310), y: stageY(700)},
      ]} />
    </DemoStage>
  );
};

export const AccurateOutroScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const reveal = springLike(frame, 8, 28);
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: 'linear-gradient(145deg,#f8fbff,#edf4ff 58%,#fff8df)', display: 'grid', placeItems: 'center', fontFamily: 'Inter, Segoe UI, Arial, sans-serif'}}>
      <div style={{textAlign: 'center', opacity: reveal, transform: `translateY(${(1 - reveal) * 24}px) scale(${.95 + reveal * .05})`}}><div style={{display: 'flex', justifyContent: 'center'}}><GradTrackLogo width={500} /></div><h1 style={{fontSize: 53, lineHeight: 1.13, letterSpacing: -1.9, margin: '32px 0 0'}}>Connecting Graduates. Tracking Careers.<br /><span style={{color: '#1d4ed8'}}>Supporting Opportunities.</span></h1><div style={{fontSize: 21, color: '#64748b', fontWeight: 750, marginTop: 23}}>Norzagaray College</div><div style={{display: 'flex', gap: 9, justifyContent: 'center', marginTop: 30}}>{['Verify','Survey','Connect','Message','Explore Jobs','Update Profile'].map((item,index)=><span key={item} style={{padding: '8px 12px', borderRadius: 999, border: '1px solid #dbe3ef', background: '#fff', color: index === 4 ? '#1d4ed8' : '#475569', fontSize: 10.5, fontWeight: 800}}>{item}</span>)}</div></div><div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 9, background: 'linear-gradient(90deg,#1d4ed8 0 68%,#f8c331 68%)'}} />
    </div>
  );
};
