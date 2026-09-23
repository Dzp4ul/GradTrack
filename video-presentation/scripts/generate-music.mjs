import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '..', 'audio', 'gradtrack-ambient-bed.wav');
const sampleRate = 48000;
const durationSeconds = 192;
const channels = 2;
const bitsPerSample = 16;
const frameCount = sampleRate * durationSeconds;
const dataSize = frameCount * channels * (bitsPerSample / 8);
const buffer = Buffer.allocUnsafe(44 + dataSize);

const chords = [
  [130.81, 164.81, 196.0],
  [110.0, 130.81, 164.81],
  [87.31, 130.81, 164.81],
  [98.0, 146.83, 174.61],
];

const writeString = (offset, value) => buffer.write(value, offset, 'ascii');
writeString(0, 'RIFF');
buffer.writeUInt32LE(36 + dataSize, 4);
writeString(8, 'WAVE');
writeString(12, 'fmt ');
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(channels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
buffer.writeUInt16LE(bitsPerSample, 34);
writeString(36, 'data');
buffer.writeUInt32LE(dataSize, 40);

const pad = (time, chord, detune, phaseOffset) => {
  let value = 0;
  chord.forEach((frequency, index) => {
    const f = frequency * detune;
    const phase = 2 * Math.PI * f * time + phaseOffset * (index + 1);
    value += Math.sin(phase) * 0.58;
    value += Math.sin(phase * 2 + 0.35) * 0.11;
  });
  return value / chord.length;
};

for (let frame = 0; frame < frameCount; frame += 1) {
  const time = frame / sampleRate;
  const chordPosition = time / 8;
  const chordIndex = Math.floor(chordPosition) % chords.length;
  const nextChordIndex = (chordIndex + 1) % chords.length;
  const withinChord = time % 8;
  const crossfade = withinChord > 6.5 ? (withinChord - 6.5) / 1.5 : 0;
  const blend = crossfade * crossfade * (3 - 2 * crossfade);
  const introFade = Math.min(1, time / 3);
  const outroFade = Math.min(1, (durationSeconds - time) / 8);
  const masterFade = Math.max(0, Math.min(introFade, outroFade));
  const breathing = 0.82 + Math.sin(time * Math.PI / 6) * 0.08;
  const pluckAge = time % 4;
  const pluckStep = Math.floor(time / 4) % 6;
  const pluckFrequency = chords[chordIndex][pluckStep % 3] * (pluckStep >= 3 ? 4 : 2);
  const pluckEnvelope = pluckAge < 1.8 ? Math.exp(-pluckAge * 2.5) * Math.min(1, pluckAge * 18) : 0;
  const pulseAge = time % 2;
  const pulse = pulseAge < 0.7
    ? Math.sin(2 * Math.PI * chords[chordIndex][0] * 0.5 * time) * Math.exp(-pulseAge * 5) * 0.08
    : 0;

  for (let channel = 0; channel < channels; channel += 1) {
    const side = channel === 0 ? -1 : 1;
    const current = pad(time, chords[chordIndex], 1 + side * 0.0007, side * 0.12);
    const next = pad(time, chords[nextChordIndex], 1 + side * 0.0007, side * 0.12);
    const padValue = current * (1 - blend) + next * blend;
    const pluck = Math.sin(2 * Math.PI * pluckFrequency * (1 + side * 0.0012) * time + side * 0.3) * pluckEnvelope * 0.12;
    const shimmer = Math.sin(2 * Math.PI * (chords[chordIndex][2] * 4) * time + side * 0.45) * 0.012;
    const sample = Math.max(-1, Math.min(1, (padValue * 0.32 * breathing + pluck + pulse + shimmer) * masterFade));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + (frame * channels + channel) * 2);
  }
}

fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, buffer);
process.stdout.write(`Generated original ambient music: ${outputPath}\n`);
