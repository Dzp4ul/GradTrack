export const VIDEO = {
  id: 'GradTrackGraduatePresentation',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 5880,
} as const;

export const sec = (seconds: number) => Math.round(seconds * VIDEO.fps);

export type SceneKey =
  | 'intro'
  | 'verification'
  | 'survey'
  | 'account'
  | 'login'
  | 'community'
  | 'announcements'
  | 'messages'
  | 'jobs'
  | 'profile'
  | 'notifications'
  | 'outro';

export interface SceneConfig {
  key: SceneKey;
  from: number;
  duration: number;
  title: string;
  kicker: string;
  narration?: string;
  narrationDuration?: number;
}

export const SCENES: SceneConfig[] = [
  {key: 'intro', from: 0, duration: sec(10), title: 'Introduction', kicker: 'GRADTRACK', narration: 'audio/01-intro.mp3', narrationDuration: 7.7},
  {key: 'verification', from: sec(10), duration: sec(11), title: 'Verify your graduate information', kicker: 'STEP 01', narration: 'audio/02-verification.mp3', narrationDuration: 8.3},
  {key: 'survey', from: sec(21), duration: sec(24), title: 'Complete the Graduate Tracer Survey', kicker: 'STEP 02', narration: 'audio/03-survey.mp3', narrationDuration: 22.06},
  {key: 'account', from: sec(45), duration: sec(17), title: 'Create your Graduate Portal account', kicker: 'STEP 03', narration: 'audio/04-account.mp3', narrationDuration: 14.9},
  {key: 'login', from: sec(62), duration: sec(11), title: 'Enter the Graduate Portal', kicker: 'STEP 04', narration: 'audio/05-login.mp3', narrationDuration: 9.5},
  {key: 'community', from: sec(73), duration: sec(19), title: 'Connect with the alumni community', kicker: 'COMMUNITY', narration: 'audio/06-community.mp3', narrationDuration: 16.9},
  {key: 'announcements', from: sec(92), duration: sec(12), title: 'Stay updated through announcements', kicker: 'UPDATES', narration: 'audio/07-announcements.mp3', narrationDuration: 10.18},
  {key: 'messages', from: sec(104), duration: sec(19), title: 'Message fellow graduates and groups', kicker: 'MESSAGES', narration: 'audio/08-messages.mp3', narrationDuration: 17.09},
  {key: 'jobs', from: sec(123), duration: sec(27), title: 'Explore and share job opportunities', kicker: 'CAREER SUPPORT', narration: 'audio/09-jobs.mp3', narrationDuration: 24.38},
  {key: 'profile', from: sec(150), duration: sec(18), title: 'Review and update your graduate profile', kicker: 'PROFILE', narration: 'audio/10-profile.mp3', narrationDuration: 16.13},
  {key: 'notifications', from: sec(168), duration: sec(12), title: 'Keep track of important activity', kicker: 'NOTIFICATIONS', narration: 'audio/11-notifications.mp3', narrationDuration: 9.79},
  {key: 'outro', from: sec(180), duration: sec(16), title: 'Closing', kicker: 'NORZAGARAY COLLEGE', narration: 'audio/12-outro.mp3', narrationDuration: 13.73},
];

export const COLORS = {
  navy: '#071735',
  navySoft: '#0f2f73',
  blue: '#1d4ed8',
  blueBright: '#2563eb',
  gold: '#f8c331',
  surface: '#ffffff',
  canvas: '#f4f7fc',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4f0',
} as const;
