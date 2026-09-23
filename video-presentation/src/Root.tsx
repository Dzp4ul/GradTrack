import React from 'react';
import {Composition} from 'remotion';
import {GradTrackGraduatePresentation} from './Presentation';
import {VIDEO} from './config';
import './styles.css';

export const RemotionRoot: React.FC = () => (
  <Composition
    id={VIDEO.id}
    component={GradTrackGraduatePresentation}
    durationInFrames={VIDEO.durationInFrames}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
  />
);
