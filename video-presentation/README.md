# GradTrack Graduate/Alumni Video Presentation

This folder contains the official graduate/alumni product presentation generated from the current GradTrack frontend. The presentation uses actual repository routes and components with an isolated fictional dataset, professional English narration, an original low-volume music bed, chapter headings, motion, and a branded intro/outro.

## Deliverables

- `gradtrack-graduate-presentation.mp4` — final 1920 × 1080, 30 FPS, H.264/AAC presentation
- `narration-script.md` — final voice-over copy
- `timeline.md` — scene timings, screen actions, and audio mapping
- `current-experience-audit.md` — current route/feature audit and reference-video differences
- `quality-report.md` — final codec, privacy, visual, and delivery checks
- `scripts/capture-ui.mjs` — repeatable actual-UI capture with intercepted demo responses
- `scripts/generate-narration.ps1` — repeatable English voice-over generation
- `scripts/generate-music.mjs` — deterministic original background-music generator
- `src/` — Remotion presentation source
- `assets/`, `screenshots/`, and `audio/` — presentation media

`public/` is a generated render cache. `npm run sync` refreshes it from the three media folders above.

## Safety model

The capture uses the real current GradTrack interface but does not use the live database. `capture-ui.mjs` intercepts browser API requests and supplies presentation-only sample graduates, posts, announcements, conversations, jobs, profile fields, and notifications. It neither creates nor edits application records. Reserved `example.com` addresses and visibly fictional organizations are used throughout.

## Requirements

- Node.js and npm
- Google Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`, or set `CHROME_PATH`
- Python 3 with `edge-tts` for narration regeneration
- The GradTrack frontend dependencies installed

Install the presentation dependencies once:

```powershell
cd C:\xampp\htdocs\GradTrack\video-presentation
npm install
py -m pip install edge-tts
```

## Regenerate the presentation

1. Start the current GradTrack frontend in one terminal:

```powershell
cd C:\xampp\htdocs\GradTrack\frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

2. In a second terminal, regenerate the actual-UI captures and media:

```powershell
cd C:\xampp\htdocs\GradTrack\video-presentation
npm run capture
npm run narration
npm run music
```

If the frontend uses another address, set it before capture:

```powershell
$env:GRADTRACK_CAPTURE_URL = 'http://127.0.0.1:5173'
npm run capture
```

3. Validate and render:

```powershell
npm run typecheck
npm run render
```

The render command refreshes `public/` automatically and writes `gradtrack-graduate-presentation.mp4` in this folder. For a smaller review copy, run `npm run render:preview`. To inspect and adjust the timeline visually, run `npm run studio`.

## Update workflow

When the application changes, audit `frontend/src/App.tsx`, the graduate portal, survey, sign-in, and graduate components first. Update the mock response shapes and scripted actions in `scripts/capture-ui.mjs` so they continue to match the real UI. Then update `src/config.ts`, `src/Presentation.tsx`, the narration script, and the timeline together before rendering.

Never replace the demo fixtures with exported production data. Keep passwords masked, use reserved example contact details, and review every regenerated screenshot before delivery.
