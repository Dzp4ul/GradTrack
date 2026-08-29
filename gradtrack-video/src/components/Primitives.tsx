import React, {ReactNode} from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';

export const fadeForScene = (frame: number, duration: number, edge = 18) =>
  interpolate(frame, [0, edge, duration - edge, Math.max(duration - 1, duration - edge + 1)], [0.75, 1, 1, 0.75], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const springLike = (frame: number, start = 0, duration = 24) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

export const SceneCanvas: React.FC<{
  children: ReactNode;
  duration: number;
  background?: string;
}> = ({children, duration, background}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      opacity: fadeForScene(frame, duration),
      background: background || 'radial-gradient(circle at 75% 10%, #e0ecff 0, #f8fafc 38%, #eef3fb 100%)',
      fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      color: '#0f172a',
    }}>
      {children}
    </div>
  );
};
