import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {BrowserScene, Intro, Outro} from './components';
import {SCENES, sec, VIDEO} from './config';

const scene = (key: string) => {
  const match = SCENES.find((item) => item.key === key);
  if (!match) throw new Error(`Unknown scene: ${key}`);
  return match;
};

const Narration: React.FC<{src: string; duration: number}> = ({src, duration}) => (
  <Sequence from={sec(0.75)} durationInFrames={Math.min(duration - sec(0.75), sec(40))}>
    <Audio src={staticFile(src)} volume={1} />
  </Sequence>
);

const BackgroundMusic: React.FC = () => {
  const frame = useCurrentFrame();
  let ducked = false;
  for (const item of SCENES) {
    if (!item.narration || !item.narrationDuration) continue;
    const start = item.from + sec(0.45);
    const end = item.from + sec(item.narrationDuration + 1.25);
    if (frame >= start && frame <= end) {
      ducked = true;
      break;
    }
  }

  const base = ducked ? 0.055 : 0.14;
  const opening = interpolate(frame, [0, sec(2.5)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ending = interpolate(frame, [VIDEO.durationInFrames - sec(7), VIDEO.durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <Audio src={staticFile('audio/gradtrack-ambient-bed.wav')} volume={base * opening * ending} />;
};

const VoiceTrack: React.FC = () => (
  <>
    {SCENES.map((item) => item.narration ? (
      <Sequence key={item.key} from={item.from} durationInFrames={item.duration} name={`${item.title} narration`}>
        <Narration src={item.narration} duration={item.duration} />
      </Sequence>
    ) : null)}
  </>
);

export const GradTrackGraduatePresentation: React.FC = () => {
  const intro = scene('intro');
  const verification = scene('verification');
  const survey = scene('survey');
  const account = scene('account');
  const login = scene('login');
  const community = scene('community');
  const announcements = scene('announcements');
  const messages = scene('messages');
  const jobs = scene('jobs');
  const profile = scene('profile');
  const notifications = scene('notifications');
  const outro = scene('outro');

  return (
    <AbsoluteFill style={{fontFamily: 'Inter, Segoe UI, Arial, sans-serif', backgroundColor: '#f4f7fc'}}>
      <BackgroundMusic />
      <VoiceTrack />

      <Sequence from={intro.from} durationInFrames={intro.duration} name="01 · Introduction">
        <Intro duration={intro.duration} />
      </Sequence>

      <Sequence from={verification.from} durationInFrames={verification.duration} name="02 · Graduate verification">
        <BrowserScene
          duration={verification.duration}
          kicker={verification.kicker}
          title={verification.title}
          browserLabel="GradTrack · Graduate verification"
          slides={[{asset: 'screenshots/01-verification.png', from: 0, to: verification.duration, zoom: .008}]}
          cursor={[{frame: 0, x: 1220, y: 735}, {frame: sec(5.8), x: 1050, y: 890, click: true}, {frame: verification.duration - 1, x: 1050, y: 890}]}
        />
      </Sequence>

      <Sequence from={survey.from} durationInFrames={survey.duration} name="03 · Graduate Tracer Survey">
        <BrowserScene
          duration={survey.duration}
          kicker={survey.kicker}
          title={survey.title}
          browserLabel="GradTrack · Graduate Tracer Survey"
          slides={[
            {asset: 'screenshots/02-survey-personal.png', from: 0, to: sec(5)},
            {asset: 'screenshots/03-survey-education.png', from: sec(4.5), to: sec(9.6)},
            {asset: 'screenshots/04-survey-employment.png', from: sec(9.1), to: sec(14.2)},
            {asset: 'screenshots/05-survey-career.png', from: sec(13.7), to: sec(18.6)},
            {asset: 'screenshots/06-survey-review.png', from: sec(18.1), to: survey.duration, zoom: .006},
          ]}
          cursor={[{frame: 0, x: 530, y: 320}, {frame: sec(7), x: 790, y: 320}, {frame: sec(12), x: 1020, y: 320}, {frame: sec(17), x: 1240, y: 320}, {frame: sec(21), x: 1460, y: 320, click: true}, {frame: survey.duration - 1, x: 1460, y: 320}]}
        />
      </Sequence>

      <Sequence from={account.from} durationInFrames={account.duration} name="04 · Survey completion and account creation">
        <BrowserScene
          duration={account.duration}
          kicker={account.kicker}
          title={account.title}
          browserLabel="GradTrack · Survey completion"
          slides={[
            {asset: 'screenshots/06b-survey-complete.png', from: 0, to: sec(6.7), zoom: .006},
            {asset: 'screenshots/07b-account-after-survey.png', from: sec(6.1), to: account.duration, zoom: .006},
          ]}
          cursor={[{frame: 0, x: 980, y: 770}, {frame: sec(5.2), x: 700, y: 760, click: true}, {frame: sec(10.4), x: 1120, y: 690}, {frame: account.duration - 1, x: 700, y: 800, click: true}]}
        />
      </Sequence>

      <Sequence from={login.from} durationInFrames={login.duration} name="05 · Graduate login">
        <BrowserScene
          duration={login.duration}
          kicker={login.kicker}
          title={login.title}
          browserLabel="GradTrack · Graduate Portal login"
          slides={[{asset: 'screenshots/08-login.png', from: 0, to: login.duration, zoom: .01}]}
          cursor={[{frame: 0, x: 1120, y: 600}, {frame: sec(6.5), x: 960, y: 725, click: true}, {frame: login.duration - 1, x: 960, y: 725}]}
        />
      </Sequence>

      <Sequence from={community.from} durationInFrames={community.duration} name="06 · Community Forum">
        <BrowserScene
          duration={community.duration}
          kicker={community.kicker}
          title={community.title}
          browserLabel="GradTrack · Graduate Portal / Home"
          slides={[
            {asset: 'screenshots/09-community-forum.png', from: 0, to: sec(10.5), zoom: .006},
            {asset: 'screenshots/10-community-create-post.png', from: sec(9.9), to: community.duration, zoom: .006},
          ]}
          cursor={[{frame: 0, x: 1070, y: 650}, {frame: sec(8.4), x: 1485, y: 350, click: true}, {frame: sec(13), x: 1080, y: 485}, {frame: community.duration - 1, x: 670, y: 800, click: true}]}
        />
      </Sequence>

      <Sequence from={announcements.from} durationInFrames={announcements.duration} name="07 · Announcements">
        <BrowserScene
          duration={announcements.duration}
          kicker={announcements.kicker}
          title={announcements.title}
          browserLabel="GradTrack · Graduate Portal / Announcements"
          slides={[{asset: 'screenshots/11-announcements.png', from: 0, to: announcements.duration, zoom: .008, panY: -4}]}
          cursor={[{frame: 0, x: 1180, y: 510}, {frame: sec(7.5), x: 610, y: 750, click: true}, {frame: announcements.duration - 1, x: 610, y: 750}]}
        />
      </Sequence>

      <Sequence from={messages.from} durationInFrames={messages.duration} name="08 · Direct and group messages">
        <BrowserScene
          duration={messages.duration}
          kicker={messages.kicker}
          title={messages.title}
          browserLabel="GradTrack · Graduate Portal / Messages"
          slides={[
            {asset: 'screenshots/12-direct-messages.png', from: 0, to: sec(9.8), zoom: .004},
            {asset: 'screenshots/13-group-chat.png', from: sec(9.2), to: messages.duration, zoom: .004},
          ]}
          cursor={[{frame: 0, x: 1420, y: 630}, {frame: sec(8.7), x: 350, y: 590, click: true}, {frame: sec(13.5), x: 1120, y: 710}, {frame: messages.duration - 1, x: 1120, y: 710}]}
        />
      </Sequence>

      <Sequence from={jobs.from} durationInFrames={jobs.duration} name="09 · Browse Jobs">
        <BrowserScene
          duration={jobs.duration}
          kicker={jobs.kicker}
          title={jobs.title}
          browserLabel="GradTrack · Graduate Portal / Career Support"
          slides={[
            {asset: 'screenshots/14-browse-jobs.png', from: 0, to: sec(9.2), zoom: .004},
            {asset: 'screenshots/15-job-details.png', from: sec(8.6), to: sec(17.8), zoom: .005},
            {asset: 'screenshots/15b-create-job-post.png', from: sec(17.2), to: jobs.duration, zoom: .004},
          ]}
          cursor={[{frame: 0, x: 900, y: 470}, {frame: sec(7.8), x: 825, y: 1005, click: true}, {frame: sec(13), x: 1140, y: 665}, {frame: sec(17.3), x: 1120, y: 180, click: true}, {frame: sec(22), x: 700, y: 520}, {frame: jobs.duration - 1, x: 700, y: 520}]}
        />
      </Sequence>

      <Sequence from={profile.from} durationInFrames={profile.duration} name="10 · Graduate profile and settings">
        <BrowserScene
          duration={profile.duration}
          kicker={profile.kicker}
          title={profile.title}
          browserLabel="GradTrack · Graduate Portal / My Profile"
          slides={[
            {asset: 'screenshots/16-profile.png', from: 0, to: sec(8.9), zoom: .004, panY: -3},
            {asset: 'screenshots/17-profile-settings.png', from: sec(8.3), to: profile.duration, zoom: .004},
          ]}
          cursor={[{frame: 0, x: 1550, y: 310}, {frame: sec(7.6), x: 1700, y: 250, click: true}, {frame: sec(12.5), x: 870, y: 730}, {frame: profile.duration - 1, x: 870, y: 730}]}
        />
      </Sequence>

      <Sequence from={notifications.from} durationInFrames={notifications.duration} name="11 · Notifications">
        <BrowserScene
          duration={notifications.duration}
          kicker={notifications.kicker}
          title={notifications.title}
          browserLabel="GradTrack · Graduate Portal / Notifications"
          slides={[{asset: 'screenshots/18-notifications.png', from: 0, to: notifications.duration, zoom: .007, panX: -5}]}
          cursor={[{frame: 0, x: 1525, y: 150}, {frame: sec(5.5), x: 1445, y: 300, click: true}, {frame: notifications.duration - 1, x: 1445, y: 300}]}
        />
      </Sequence>

      <Sequence from={outro.from} durationInFrames={outro.duration} name="12 · Closing">
        <Outro duration={outro.duration} />
      </Sequence>
    </AbsoluteFill>
  );
};
