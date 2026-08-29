import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {SCENES} from './config/video';
import {
  AccurateAnnouncementsScene,
  AccurateCommunityScene,
  AccurateGroupChatScene,
  AccurateJobsScene,
  AccurateMessagesScene,
  AccurateOutroScene,
  AccurateProfileScene,
} from './scenes/AccuratePortalJourney';
import {CreateAccountScene, TracerSurveyScene, VerifyIdentityScene} from './scenes/AccurateSurveyJourney';

export const GradTrackGraduateDemo: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#f8fafc'}}>
    <Sequence from={SCENES.verification.from} durationInFrames={SCENES.verification.duration} name="01 · Graduate identity verification">
      <VerifyIdentityScene duration={SCENES.verification.duration} />
    </Sequence>
    <Sequence from={SCENES.survey.from} durationInFrames={SCENES.survey.duration} name="02 · Graduate tracer survey">
      <TracerSurveyScene duration={SCENES.survey.duration} />
    </Sequence>
    <Sequence from={SCENES.account.from} durationInFrames={SCENES.account.duration} name="03 · Create Graduate Portal account">
      <CreateAccountScene duration={SCENES.account.duration} />
    </Sequence>
    <Sequence from={SCENES.announcements.from} durationInFrames={SCENES.announcements.duration} name="04 · Announcements">
      <AccurateAnnouncementsScene duration={SCENES.announcements.duration} />
    </Sequence>
    <Sequence from={SCENES.community.from} durationInFrames={SCENES.community.duration} name="05 · Community Forum">
      <AccurateCommunityScene duration={SCENES.community.duration} />
    </Sequence>
    <Sequence from={SCENES.messages.from} durationInFrames={SCENES.messages.duration} name="06 · Direct messaging">
      <AccurateMessagesScene duration={SCENES.messages.duration} />
    </Sequence>
    <Sequence from={SCENES.groupChats.from} durationInFrames={SCENES.groupChats.duration} name="07 · Create a group chat">
      <AccurateGroupChatScene duration={SCENES.groupChats.duration} />
    </Sequence>
    <Sequence from={SCENES.jobs.from} durationInFrames={SCENES.jobs.duration} name="08 · Browse jobs and application link">
      <AccurateJobsScene duration={SCENES.jobs.duration} />
    </Sequence>
    <Sequence from={SCENES.profile.from} durationInFrames={SCENES.profile.duration} name="09 · Scrolling graduate profile">
      <AccurateProfileScene duration={SCENES.profile.duration} />
    </Sequence>
    <Sequence from={SCENES.outro.from} durationInFrames={SCENES.outro.duration} name="10 · GradTrack closing">
      <AccurateOutroScene duration={SCENES.outro.duration} />
    </Sequence>
  </AbsoluteFill>
);
