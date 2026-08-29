# GradTrack Graduate/Alumni Demo Video

Editable Remotion source for the GradTrack Graduate/Alumni walkthrough. The composition follows the real graduate journey and visual structure found in the GradTrack React project and the supplied UI screenshots. It uses privacy-safe demo values and never connects to or writes to the GradTrack database.

## Final output

- Composition: `GradTrackGraduateDemo`
- Resolution: 1920 x 1080 (16:9)
- Frame rate: 30 FPS
- Duration: 4,260 frames / 2:22
- Video codec: H.264
- Pixel format: 4:2:0-compatible H.264 output
- Audio: silent optional track; narration or music is not required
- File: `output/gradtrack-graduate-demo.mp4`

## Final scene order

1. Graduate identity verification at `/survey-verify`
2. Graduate Tracer Study Survey sections and successful submission
3. Graduate Portal account creation with masked password fields
4. Announcements list and announcement details
5. Community Forum and graduate post creation
6. One-to-one graduate messaging
7. Group Chats and the complete group-chat creation flow
8. Browse Jobs with employer email, `Application link`, and `View Details`
9. Graduate profile with an animated vertical scroll through the profile hero, Contacts, Information, Work, Education, Trainings, and Community Forum posts
10. GradTrack closing screen

The Browse Jobs scene intentionally has no in-system Apply button. It demonstrates the actual employer-provided `Application link` behavior.

The composition contains no graduate login scene, job-posting form, notification scene, hidden legacy dashboard, or administrative interface. No Super Admin, MIS Staff, Research Coordinator, Alumni Admin, Registrar, Dean, settings, approval-management, analytics, survey-management, or user-management screen appears.

## Project structure

```text
gradtrack-video/
|- public/assets/                   GradTrack logo, mark, campus, and announcement image
|- src/
|  |- animations/                  Cursor movement, click feedback, and typing helpers
|  |- components/AccurateUI.tsx    Browser, survey, portal header, cards, and shared UI
|  |- config/video.ts              Full HD specification and final scene timeline
|  |- scenes/
|  |  |- AccurateSurveyJourney.tsx Verification, survey, and account creation
|  |  `- AccuratePortalJourney.tsx Announcements through profile and closing
|  |- GradTrackGraduateDemo.tsx    Master timeline
|  |- Root.tsx                     Remotion composition registration
|  `- index.ts                     Remotion entry point
|- output/
|  |- gradtrack-graduate-demo.mp4
|  `- final-contact-sheet.png      Encoded-video QA samples
|- package.json
`- tsconfig.json
```

## Install

From this directory:

```powershell
npm install
```

Node.js 18 or newer is recommended. The included lockfile pins the dependency versions.

## Preview and edit

Open Remotion Studio:

```powershell
npm run studio
```

Useful editing locations:

- Change scene order or timing in `src/config/video.ts` and `src/GradTrackGraduateDemo.tsx`.
- Change dummy graduate text directly in the two scene files.
- Adjust click timing and target coordinates in each scene's `AnimatedCursor` point list.
- Replace approved local images in `public/assets/`; keep the filenames or update the corresponding `staticFile(...)` call.
- Adjust the shared browser, survey, and portal styling in `src/components/AccurateUI.tsx`.

When changing a scene duration, update its `from` and `duration` values and the total `durationInFrames` in `src/config/video.ts`.

## Render

Render the final Full HD H.264 video:

```powershell
npm run render
```

Render a faster half-scale review copy:

```powershell
npm run render:preview
```

Run the TypeScript check:

```powershell
npm run typecheck
```

## Privacy and production safety

- Graduate details use the fictional `Juan Dela Cruz` identity and reserved-looking contact values.
- Passwords are shown only as masked dots.
- No API keys, environment variables, database credentials, real private messages, or private alumni contact data are embedded.
- The personal details visible in the supplied screenshots were not copied into the video.
- No production database write was performed.
- All implementation changes stay under `gradtrack-video/`; no production route, component, API, authentication rule, or database schema was changed.

## Verification checklist

- TypeScript check passes.
- The complete 4,260-frame composition renders successfully.
- FFprobe is used to confirm H.264, 1920 x 1080, 30 FPS, duration, and frame count.
- Encoded timestamps across the full file are assembled into `output/final-contact-sheet.png` and visually reviewed.
- Cursor-click frames are decoded separately to confirm that each cursor tip touches its intended control.
- The encoded file is sampled for black or visually blank frames.
- Only Graduate/Alumni screens are included.
