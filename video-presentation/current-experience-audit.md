# Current Graduate/Alumni Experience Audit

This audit was completed against the current repository before the presentation was produced. The principal route source is `frontend/src/App.tsx`; the graduate experience is implemented primarily in `frontend/src/pages/GraduatePortal.tsx` and its graduate components.

## Current journey represented in the video

1. `/survey-verify` verifies a graduate against institutional records.
2. `/survey` presents the multi-section Graduate Tracer Survey, draft state, review, and submission flow.
3. Successful survey submission can open the Graduate Portal account-creation step. The resulting account is submitted for Alumni Admin verification.
4. `/graduate/signin` authenticates an approved graduate.
5. The authenticated home route redirects to `/graduate/portal?tab=community_forum`, so Community Forum—not Announcements—is shown as the main landing view.
6. Community Forum supports reading posts, reactions/comments, creating posts, managing the graduate's posts, filters, and links to fellow graduates.
7. Announcements remain available through the dedicated graduate announcements route.
8. Direct messages and group chats now share one unified Messages area.
9. Career support includes Browse Jobs, job details/application information, and a separate Job Posting module. Job submission is available to graduates whose employment status is set to employed, and submitted jobs require review before appearing in Browse Jobs.
10. My Profile combines graduate, education, contact, and employment information. Settings can update profile data separately from the already submitted tracer survey.
11. Notifications bring together job, forum, message, and announcement activity.

## Important changes from the reference presentation

- A branded opening and closing have been added.
- Community Forum is correctly presented as the default authenticated landing view.
- Direct and group conversations are presented as one Messages experience rather than unrelated modules.
- Current job details, graduate job submission, notifications, profile settings, and the distinction between profile edits and submitted survey data are represented.
- All visible posts, announcements, messages, job opportunities, users, contact information, and credentials are fictional sample data created for this presentation.

## Privacy and accuracy controls

The capture script loads the actual current React routes and components, but intercepts the presentation browser's API traffic and returns a self-contained fictional dataset. It does not query or update the live application database. Password fields remain masked, application links use reserved example domains, and the rendered browser frame does not expose localhost, developer tools, tokens, database identifiers, or server diagnostics.

