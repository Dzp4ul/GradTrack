import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS} from './config';

export const Fade: React.FC<{children: React.ReactNode; duration: number}> = ({children, duration}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 14, duration - 14, duration], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

export const SceneBackdrop: React.FC = () => (
  <AbsoluteFill style={{background: 'linear-gradient(145deg, #f8fbff 0%, #f4f7fc 54%, #eaf1fb 100%)'}}>
    <div style={{position: 'absolute', left: -120, top: -160, width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,.13), rgba(37,99,235,0) 68%)'}} />
    <div style={{position: 'absolute', right: -200, bottom: -260, width: 760, height: 760, borderRadius: '50%', background: 'radial-gradient(circle, rgba(248,195,49,.12), rgba(248,195,49,0) 70%)'}} />
    <div style={{position: 'absolute', inset: 0, opacity: 0.16, backgroundImage: 'linear-gradient(rgba(15,47,115,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,47,115,.08) 1px, transparent 1px)', backgroundSize: '52px 52px'}} />
  </AbsoluteFill>
);

export const SceneHeading: React.FC<{kicker: string; title: string; sampleData?: boolean}> = ({kicker, title, sampleData = true}) => {
  const frame = useCurrentFrame();
  const reveal = spring({frame, fps: 30, config: {damping: 18, stiffness: 120}});
  return (
    <div style={{position: 'absolute', left: 72, right: 72, top: 28, height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: reveal, transform: `translateY(${(1 - reveal) * 12}px)`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
        <span style={{width: 10, height: 10, borderRadius: '50%', background: COLORS.blueBright, boxShadow: '0 0 0 7px rgba(37,99,235,.10)'}} />
        <span style={{fontSize: 17, letterSpacing: 2.7, fontWeight: 800, color: COLORS.blue}}>{kicker}</span>
        <span style={{width: 1, height: 24, background: '#cad6e6'}} />
        <span style={{fontSize: 28, fontWeight: 780, color: COLORS.navy, letterSpacing: -0.55}}>{title}</span>
      </div>
      {sampleData && (
        <div style={{display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #d8e2ef', borderRadius: 999, background: 'rgba(255,255,255,.78)', padding: '8px 14px', color: '#64748b', fontSize: 13, fontWeight: 750, letterSpacing: 1.2}}>
          <span style={{width: 7, height: 7, borderRadius: '50%', background: '#16a34a'}} />
          SAMPLE DATA
        </div>
      )}
    </div>
  );
};

const BrowserChrome: React.FC<{label: string}> = ({label}) => (
  <div style={{height: 48, display: 'grid', gridTemplateColumns: '120px 1fr 120px', alignItems: 'center', padding: '0 18px', background: '#f8fafc', borderBottom: '1px solid #d9e2ee'}}>
    <div style={{display: 'flex', gap: 9}}>
      <span style={{width: 12, height: 12, borderRadius: '50%', background: '#ff6b6b'}} />
      <span style={{width: 12, height: 12, borderRadius: '50%', background: '#f8c331'}} />
      <span style={{width: 12, height: 12, borderRadius: '50%', background: '#33c99a'}} />
    </div>
    <div style={{justifySelf: 'center', width: 620, maxWidth: '100%', height: 31, borderRadius: 10, border: '1px solid #dde5ef', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, color: '#64748b', fontSize: 13, fontWeight: 650}}>
      <span style={{width: 7, height: 7, borderRadius: '50%', background: '#22c55e'}} />
      {label}
    </div>
    <div style={{justifySelf: 'end', display: 'flex', gap: 5}}>
      {[0, 1, 2].map((dot) => <span key={dot} style={{width: 5, height: 5, borderRadius: '50%', background: '#94a3b8'}} />)}
    </div>
  </div>
);

export interface Slide {
  asset: string;
  from: number;
  to: number;
  panX?: number;
  panY?: number;
  zoom?: number;
}

const ScreenshotLayer: React.FC<{slide: Slide; sceneFrame: number}> = ({slide, sceneFrame}) => {
  const fadeFrames = 10;
  const opacity = interpolate(sceneFrame, [slide.from, slide.from + fadeFrames, slide.to - fadeFrames, slide.to], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const progress = interpolate(sceneFrame, [slide.from, slide.to], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const zoom = 1 + progress * (slide.zoom ?? 0.012);
  const x = (slide.panX ?? 0) * progress;
  const y = (slide.panY ?? 0) * progress;
  return (
    <Img
      src={staticFile(slide.asset)}
      style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', opacity, transform: `translate(${x}px, ${y}px) scale(${zoom})`, transformOrigin: 'center center'}}
    />
  );
};

export const BrowserScene: React.FC<{
  duration: number;
  kicker: string;
  title: string;
  browserLabel: string;
  slides: Slide[];
  cursor?: Array<{frame: number; x: number; y: number; click?: boolean}>;
}> = ({duration, kicker, title, browserLabel, slides, cursor}) => {
  const frame = useCurrentFrame();
  const entrance = spring({frame, fps: 30, config: {damping: 20, stiffness: 90}});
  return (
    <Fade duration={duration}>
      <SceneBackdrop />
      <SceneHeading kicker={kicker} title={title} />
      <div style={{position: 'absolute', left: 60, top: 101, width: 1800, height: 939, borderRadius: 25, overflow: 'hidden', background: '#fff', border: '1px solid rgba(148,163,184,.42)', boxShadow: '0 28px 70px rgba(15,23,42,.18), 0 3px 12px rgba(15,23,42,.08)', transform: `translateY(${(1 - entrance) * 22}px) scale(${0.985 + entrance * 0.015})`, opacity: entrance}}>
        <BrowserChrome label={browserLabel} />
        <div style={{position: 'absolute', left: 0, right: 0, top: 48, bottom: 0, background: '#fff', overflow: 'hidden'}}>
          {slides.map((slide) => <ScreenshotLayer key={`${slide.asset}-${slide.from}`} slide={slide} sceneFrame={frame} />)}
        </div>
      </div>
      {cursor && <AnimatedCursor points={cursor} />}
    </Fade>
  );
};

const AnimatedCursor: React.FC<{points: Array<{frame: number; x: number; y: number; click?: boolean}>}> = ({points}) => {
  const frame = useCurrentFrame();
  const nextIndex = points.findIndex((point) => point.frame > frame);
  const activeIndex = nextIndex === -1 ? points.length - 1 : Math.max(0, nextIndex - 1);
  const start = points[activeIndex] || points[0];
  const end = points[Math.min(activeIndex + 1, points.length - 1)] || start;
  const x = interpolate(frame, [start.frame, Math.max(start.frame + 1, end.frame)], [start.x, end.x], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const y = interpolate(frame, [start.frame, Math.max(start.frame + 1, end.frame)], [start.y, end.y], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const clickPoint = points.find((point) => point.click && Math.abs(frame - point.frame) < 10);
  const pulse = clickPoint ? interpolate(Math.abs(frame - clickPoint.frame), [0, 10], [1, 0], {extrapolateRight: 'clamp'}) : 0;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 34, height: 44, pointerEvents: 'none', filter: 'drop-shadow(0 3px 4px rgba(15,23,42,.36))'}}>
      {pulse > 0 && <span style={{position: 'absolute', left: -18, top: -18, width: 56, height: 56, borderRadius: '50%', border: `3px solid rgba(37,99,235,${pulse * 0.7})`, transform: `scale(${1.45 - pulse * 0.45})`}} />}
      <svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true">
        <path d="M3 2 L3 34 L11 27 L17 41 L24 38 L18 25 L30 25 Z" fill="white" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const Intro: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const logo = spring({frame: frame - 8, fps, config: {damping: 20, stiffness: 80}});
  const copy = spring({frame: frame - 28, fps, config: {damping: 22, stiffness: 74}});
  const fadeOut = interpolate(frame, [duration - 18, duration], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#fff', opacity: fadeOut}}>
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 36%, rgba(37,99,235,.10), transparent 38%), linear-gradient(145deg, #ffffff, #f7faff)'}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 10, background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.gold})`}} />
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: 'translateY(-18px)'}}>
        <Img src={staticFile('assets/gradtrack-logo.png')} style={{width: 600, height: 'auto', objectFit: 'contain', opacity: logo, transform: `scale(${0.92 + logo * 0.08})`}} />
        <div style={{width: 106, height: 4, borderRadius: 99, marginTop: 38, background: COLORS.gold, opacity: copy, transform: `scaleX(${copy})`}} />
        <div style={{marginTop: 28, textAlign: 'center', color: COLORS.navy, opacity: copy, transform: `translateY(${(1 - copy) * 16}px)`}}>
          <div style={{fontSize: 43, lineHeight: 1.22, fontWeight: 760, letterSpacing: -0.7}}>A Web-Based Graduate Tracer System</div>
          <div style={{fontSize: 43, lineHeight: 1.22, fontWeight: 760, letterSpacing: -0.7}}>with Alumni Job Support System</div>
          <div style={{marginTop: 25, fontSize: 24, fontWeight: 800, color: COLORS.blue, letterSpacing: 2.2}}>NORZAGARAY COLLEGE</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Outro: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = spring({frame: frame - 8, fps, config: {damping: 21, stiffness: 75}});
  const lineReveal = spring({frame: frame - 28, fps, config: {damping: 22, stiffness: 70}});
  const fadeOut = interpolate(frame, [duration - 28, duration], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: `linear-gradient(145deg, ${COLORS.navy} 0%, #0f2f73 68%, #1749a6 100%)`, opacity: fadeOut, color: '#fff'}}>
      <div style={{position: 'absolute', inset: 0, opacity: .16, backgroundImage: 'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)', backgroundSize: '58px 58px'}} />
      <div style={{position: 'absolute', left: -180, bottom: -340, width: 850, height: 850, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,.42), transparent 68%)'}} />
      <div style={{position: 'absolute', right: -140, top: -250, width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(248,195,49,.19), transparent 68%)'}} />
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{background: '#fff', borderRadius: 22, padding: '22px 38px', boxShadow: '0 20px 60px rgba(0,0,0,.24)', opacity: reveal, transform: `scale(${0.94 + reveal * .06})`}}>
          <Img src={staticFile('assets/gradtrack-logo.png')} style={{width: 470, height: 'auto'}} />
        </div>
        <div style={{marginTop: 48, textAlign: 'center', opacity: lineReveal, transform: `translateY(${(1 - lineReveal) * 18}px)`}}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, fontSize: 42, lineHeight: 1.2, fontWeight: 800, letterSpacing: -.6}}>
            <span>Connecting Graduates.</span><span style={{color: COLORS.gold}}>•</span><span>Tracking Careers.</span><span style={{color: COLORS.gold}}>•</span><span>Supporting Opportunities.</span>
          </div>
          <div style={{marginTop: 35, color: '#cbd9f5', fontSize: 19, fontWeight: 700, letterSpacing: 1.7}}>GRADUATE TRACING&nbsp;&nbsp;•&nbsp;&nbsp;COMMUNITY&nbsp;&nbsp;•&nbsp;&nbsp;CAREER OPPORTUNITIES&nbsp;&nbsp;•&nbsp;&nbsp;ALUMNI ENGAGEMENT</div>
          <div style={{marginTop: 28, color: COLORS.gold, fontSize: 23, fontWeight: 850, letterSpacing: 2.7}}>NORZAGARAY COLLEGE</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
