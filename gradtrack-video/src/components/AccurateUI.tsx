import React, {ReactNode} from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {
  Bell,
  Briefcase,
  ChevronDown,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Moon,
  Pencil,
  User,
  Users,
} from 'lucide-react';
import {COLORS} from '../config/video';
import {SceneCanvas, springLike} from './Primitives';

export const STAGE = {x: 42, y: 74, width: 1836, height: 980, chrome: 50} as const;
// Cursors are rendered inside the browser frame. Coordinates therefore use the
// browser's own origin: x is the app-space x coordinate and y includes only
// the browser chrome above the app viewport.
export const stageX = (x: number) => x;
export const stageY = (y: number) => STAGE.chrome + y;

export const DemoStage: React.FC<{
  children: ReactNode;
  duration: number;
  url: string;
  label: string;
  background?: string;
}> = ({children, duration, url, label, background}) => {
  const frame = useCurrentFrame();
  const reveal = springLike(frame, 0, 18);
  return (
    <SceneCanvas duration={duration} background={background}>
      <div style={{position: 'absolute', left: 54, top: 21, display: 'flex', alignItems: 'center', gap: 11, zIndex: 30, opacity: reveal}}>
        <span style={{width: 10, height: 10, borderRadius: 999, background: '#2563eb', boxShadow: '0 0 0 6px rgba(37,99,235,.12)'}} />
        <span style={{fontSize: 18, fontWeight: 800, color: '#1e3a8a', letterSpacing: -.2}}>{label}</span>
      </div>
      <div style={{position: 'absolute', left: STAGE.x, top: STAGE.y, width: STAGE.width, height: STAGE.height, borderRadius: 18, background: '#fff', border: '1px solid #d7dfec', boxShadow: '0 24px 72px rgba(15,23,42,.22)', overflow: 'hidden'}}>
        <div style={{height: STAGE.chrome, display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 150px', alignItems: 'center', padding: '0 18px', background: '#f8fafc', borderBottom: '1px solid #dbe3ef'}}>
          <div style={{display: 'flex', gap: 9}}>
            <span style={{width: 11, height: 11, borderRadius: 999, background: '#fb7185'}} />
            <span style={{width: 11, height: 11, borderRadius: 999, background: '#fbbf24'}} />
            <span style={{width: 11, height: 11, borderRadius: 999, background: '#34d399'}} />
          </div>
          <div style={{height: 32, maxWidth: 930, width: '100%', justifySelf: 'center', display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: 10, border: '1px solid #dbe3ef', background: '#fff', color: '#64748b', fontSize: 13}}>
            <span style={{marginRight: 9, color: '#16a34a', fontSize: 12}}>●</span>{url}
          </div>
          <div style={{justifySelf: 'end', color: '#94a3b8', fontSize: 22, letterSpacing: 4}}>•••</div>
        </div>
        <div style={{height: STAGE.height - STAGE.chrome, overflow: 'hidden', background: '#f4f6fb'}}>{children}</div>
      </div>
    </SceneCanvas>
  );
};

export const CampusBackdrop: React.FC<{children: ReactNode}> = ({children}) => (
  <div style={{height: '100%', position: 'relative', overflow: 'hidden', background: '#173f9b'}}>
    <Img src={staticFile('assets/norzagaray-campus.jpg')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
    <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(30,64,175,.82),rgba(30,58,138,.88))'}} />
    <div style={{position: 'relative', height: '100%'}}>{children}</div>
  </div>
);

export const GradTrackLogo: React.FC<{width?: number; markOnly?: boolean}> = ({width = 280, markOnly = false}) => (
  <Img src={staticFile(markOnly ? 'assets/gradtrack-mark.png' : 'assets/gradtrack-logo.png')} style={{width, height: 'auto', objectFit: 'contain'}} />
);

export const DemoAvatar: React.FC<{initials?: string; size?: number; color?: string}> = ({initials = 'JD', size = 42, color = '#1d4ed8'}) => (
  <div style={{width: size, height: size, flex: '0 0 auto', borderRadius: 999, display: 'grid', placeItems: 'center', background: `linear-gradient(145deg,${color},#071735)`, border: '3px solid #fff', boxShadow: '0 2px 8px rgba(15,23,42,.16)', color: '#fff', fontSize: size * .3, fontWeight: 900}}>{initials}</div>
);

export const Surface: React.FC<{children: ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <div style={{borderRadius: 28, border: '1px solid #dce3ed', background: '#fff', boxShadow: '0 3px 12px rgba(15,23,42,.06)', ...style}}>{children}</div>
);

export const PrimaryButton: React.FC<{children: ReactNode; style?: React.CSSProperties; pill?: boolean; muted?: boolean}> = ({children, style, pill = false, muted = false}) => (
  <div style={{height: 44, padding: '0 19px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: pill ? 999 : 9, background: muted ? '#f1f5f9' : '#2563eb', color: muted ? '#475569' : '#fff', border: muted ? '1px solid #e2e8f0' : '1px solid #2563eb', fontSize: 13, fontWeight: 800, boxShadow: muted ? 'none' : '0 5px 14px rgba(37,99,235,.18)', ...style}}>{children}</div>
);

export type AccuratePortalTab = 'Announcements' | 'Community Forum' | 'Messages' | 'Group Chats' | 'Browse Jobs' | 'Job Posting' | 'My Profile';

const portalNav = [
  {label: 'Announcements' as AccuratePortalTab, icon: Megaphone, count: 3},
  {label: 'Community Forum' as AccuratePortalTab, icon: MessageSquare, count: 1},
  {label: 'Messages' as AccuratePortalTab, icon: MessageCircle, count: 1},
  {label: 'Group Chats' as AccuratePortalTab, icon: Users, count: 3},
  {label: 'Browse Jobs' as AccuratePortalTab, icon: Briefcase, count: 3},
  {label: 'Job Posting' as AccuratePortalTab, icon: Pencil, count: 2},
];

export const AccuratePortal: React.FC<{
  active: AccuratePortalTab;
  children: ReactNode;
  scroll?: number;
  showScrollbar?: boolean;
}> = ({active, children, scroll = 0, showScrollbar = false}) => (
  <div style={{height: '100%', background: '#f4f6fb', color: '#0f172a', position: 'relative'}}>
    <header style={{height: 72, display: 'grid', gridTemplateColumns: '270px minmax(0,1fr) 360px', alignItems: 'center', padding: '0 164px', background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 2px 7px rgba(15,23,42,.06)', position: 'relative', zIndex: 10}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 11}}>
        <GradTrackLogo width={39} markOnly />
        <div><div style={{fontSize: 16, fontWeight: 900}}>GradTrack</div><div style={{fontSize: 10.5, color: '#64748b', marginTop: 1}}>Community</div></div>
      </div>
      <nav style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24}}>
        {portalNav.map(({label, icon: Icon, count}) => {
          const selected = label === active;
          return (
            <div key={label} style={{height: 46, width: 46, borderRadius: 999, border: selected ? '1px solid #bfdbfe' : '1px solid transparent', background: selected ? '#eff6ff' : 'transparent', color: selected ? '#1d4ed8' : '#64748b', display: 'grid', placeItems: 'center', position: 'relative', boxShadow: selected ? '0 0 0 2px rgba(191,219,254,.45)' : 'none'}} title={label}>
              <Icon size={20} />
              {!!count && <span style={{position: 'absolute', right: -4, top: -5, minWidth: 20, height: 20, borderRadius: 999, padding: '0 5px', display: 'grid', placeItems: 'center', background: selected ? '#f8c331' : '#f43f5e', color: selected ? '#172554' : '#fff', border: '2px solid white', fontSize: 9.5, fontWeight: 900}}>{count}</span>}
            </div>
          );
        })}
      </nav>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16}}>
        <div style={{height: 40, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, borderRadius: 999, border: '1px solid #e2e8f0', color: '#475569', fontSize: 12.5, fontWeight: 700}}><Moon size={16} /> Light <ChevronDown size={14} /></div>
        <Bell size={20} color="#64748b" />
        <div style={{height: 50, minWidth: 200, display: 'flex', alignItems: 'center', gap: 9, padding: '4px 11px 4px 6px', borderRadius: 999, border: active === 'My Profile' ? '1px solid #93c5fd' : '1px solid #e2e8f0', boxShadow: active === 'My Profile' ? '0 0 0 2px #dbeafe' : 'none'}}>
          <DemoAvatar size={36} />
          <div style={{minWidth: 0, flex: 1}}><div style={{fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap'}}>Juan Dela Cruz</div><div style={{fontSize: 10.5, color: '#64748b'}}>BSCS</div></div>
          <ChevronDown size={14} color="#64748b" />
        </div>
      </div>
    </header>
    <div style={{height: 'calc(100% - 72px)', overflow: 'hidden', position: 'relative'}}>
      <div style={{width: 1488, margin: '0 auto', padding: '20px 0 90px', transform: `translateY(${-scroll}px)`}}>{children}</div>
      {showScrollbar && <div style={{position: 'absolute', right: 7, top: 16, bottom: 16, width: 7, borderRadius: 99, background: '#e2e8f0'}}><div style={{position: 'absolute', top: interpolate(scroll, [0, 860], [0, 540], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), left: 0, width: 7, height: 180, borderRadius: 99, background: '#94a3b8'}} /></div>}
    </div>
  </div>
);

export const PortalPageTitle: React.FC<{icon: ReactNode; title: string; subtitle: string}> = ({icon, title, subtitle}) => (
  <div style={{display: 'flex', gap: 13, alignItems: 'center', paddingBottom: 18, marginBottom: 18, borderBottom: '1px solid #dbe3ef'}}>
    <div style={{width: 48, height: 48, borderRadius: 16, background: '#1d4ed8', color: '#fff', display: 'grid', placeItems: 'center'}}>{icon}</div>
    <div><div style={{fontSize: 11, fontWeight: 850, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 2.3}}>GradTrack Community</div><div style={{fontSize: 25, fontWeight: 900, marginTop: 2}}>{title}</div><div style={{fontSize: 12.5, color: '#64748b', marginTop: 3}}>{subtitle}</div></div>
  </div>
);

export const SuccessNotice: React.FC<{title: string; message: string; start?: number}> = ({title, message, start = 0}) => {
  const frame = useCurrentFrame();
  const enter = springLike(frame, start, 18);
  return (
    <div style={{position: 'absolute', right: 28, bottom: 26, width: 390, borderRadius: 16, border: '1px solid #a7f3d0', background: '#fff', boxShadow: '0 22px 54px rgba(15,23,42,.25)', padding: '17px 19px', display: 'flex', gap: 13, zIndex: 80, opacity: enter, transform: `translateY(${(1 - enter) * 26}px)`}}>
      <div style={{width: 40, height: 40, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#dcfce7', color: '#15803d', fontSize: 22, fontWeight: 900}}>✓</div>
      <div><div style={{fontSize: 14, fontWeight: 900}}>{title}</div><div style={{fontSize: 11.5, color: '#64748b', lineHeight: 1.5, marginTop: 3}}>{message}</div></div>
    </div>
  );
};

export const focusScale = (frame: number, start: number, end: number, amount = .015) => {
  const focus = interpolate(frame, [start, start + 18, end - 18, end], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return 1 + focus * amount;
};

export const portalIconFor = (tab: AccuratePortalTab) => {
  if (tab === 'Announcements') return Megaphone;
  if (tab === 'Community Forum') return MessageSquare;
  if (tab === 'Messages') return MessageCircle;
  if (tab === 'Group Chats') return Users;
  if (tab === 'Browse Jobs') return Briefcase;
  if (tab === 'Job Posting') return Pencil;
  return User;
};

export const colors = COLORS;
