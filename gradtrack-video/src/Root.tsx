import React from 'react';
import {Composition} from 'remotion';
import {GradTrackGraduateDemo} from './GradTrackGraduateDemo';
import {VIDEO} from './config/video';
import './styles.css';

export const RemotionRoot: React.FC = () => (
  <Composition
    id={VIDEO.id}
    component={GradTrackGraduateDemo}
    durationInFrames={VIDEO.durationInFrames}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
  />
);
