export const VIDEO = {
  id: 'GradTrackGraduateDemo',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 4260,
} as const;

export const COLORS = {
  primary: '#1d4ed8',
  primaryDark: '#0f2f73',
  navy: '#071735',
  accent: '#f8c331',
  canvas: '#f4f6fb',
  surface: '#ffffff',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  emerald: '#059669',
} as const;

export const SCENES = {
  verification: {from: 0, duration: 360},
  survey: {from: 360, duration: 720},
  account: {from: 1080, duration: 390},
  announcements: {from: 1470, duration: 360},
  community: {from: 1830, duration: 450},
  messages: {from: 2280, duration: 390},
  groupChats: {from: 2670, duration: 450},
  jobs: {from: 3120, duration: 420},
  profile: {from: 3540, duration: 540},
  outro: {from: 4080, duration: 180},
} as const;

export const sec = (seconds: number) => Math.round(seconds * VIDEO.fps);
