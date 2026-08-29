import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';

export interface CursorPoint {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
}

const positionAt = (frame: number, points: CursorPoint[]) => {
  if (points.length === 0) return {x: -100, y: -100};
  if (frame <= points[0].frame) return points[0];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (frame <= end.frame) {
      const t = interpolate(frame, [start.frame, end.frame], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.inOut(Easing.cubic),
      });
      return {x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t};
    }
  }
  return points[points.length - 1];
};

export const AnimatedCursor: React.FC<{points: CursorPoint[]; scale?: number; color?: string}> = ({
  points,
  scale = 1,
  color = '#ffffff',
}) => {
  const frame = useCurrentFrame();
  const position = positionAt(frame, points);
  const clickFrames = points.filter((point) => point.click).map((point) => point.frame);
  const activeClick = clickFrames.find((clickFrame) => Math.abs(frame - clickFrame) <= 9);
  const clickProgress = activeClick === undefined ? 0 : Math.abs(frame - activeClick) / 9;
  const cursorScale = activeClick === undefined ? 1 : interpolate(clickProgress, [0, 1], [0.82, 1]);

  return (
    <div style={{position: 'absolute', left: position.x - 3, top: position.y - 3, zIndex: 100, pointerEvents: 'none', transform: `scale(${scale * cursorScale})`, transformOrigin: '3px 3px'}}>
      {activeClick !== undefined && (
        <div style={{position: 'absolute', left: -17, top: -17, width: 42, height: 42, borderRadius: '50%', border: '3px solid rgba(37,99,235,.7)', opacity: 1 - clickProgress, transform: `scale(${0.35 + clickProgress * 0.95})`}} />
      )}
      <svg width="30" height="38" viewBox="0 0 30 38" fill="none" aria-hidden="true">
        <path d="M3 2.5V30l7.1-6.2 5.1 11.2 5.7-2.7-5-10.8H26L3 2.5Z" fill={color} stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const typedText = (text: string, frame: number, startFrame: number, charsPerFrame = 0.55) => {
  const count = Math.max(0, Math.floor((frame - startFrame) * charsPerFrame));
  return text.slice(0, count);
};
