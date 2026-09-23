$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$audioDir = Join-Path $projectDir 'audio'
New-Item -ItemType Directory -Force -Path $audioDir | Out-Null

$voice = 'en-PH-RosaNeural'
$rate = '-4%'
$pitch = '-2Hz'

$clips = [ordered]@{
  '01-intro.mp3' = "Welcome to GradTrack, a web-based graduate tracer system with alumni job support for Norzagaray College."
  '02-verification.mp3' = "Graduates begin by verifying their identity using information that matches the institution's official graduate records."
  '03-survey.mp3' = "After verification, graduates review the privacy notice and complete the Graduate Tracer Survey. The updated form organizes personal information, educational background, employment data, and career experience into clear sections, saves progress as a draft, and provides a final review before submission."
  '04-account.mp3' = "After submitting the survey, eligible graduates can review their verified details and create a Graduate Portal account. Passwords remain masked, and new accounts are submitted for Alumni Admin verification."
  '05-login.mp3' = "Once approved, graduates can log in securely. The updated portal opens on the Community Forum as the main graduate view."
  '06-community.mp3' = "The Community Forum allows graduates to read alumni posts, react, comment, and share useful career experiences. Graduates can create their own posts and manage the content they have submitted while following the community guidelines."
  '07-announcements.mp3' = "Announcements keep graduates informed about alumni activities, career programs, college updates, and other relevant opportunities."
  '08-messages.mp3' = "The unified Messages area supports both direct and group conversations. Graduates can communicate privately with fellow alumni, or participate in group discussions for career coordination, batch activities, and community events."
  '09-jobs.mp3' = "Browse Jobs presents approved opportunities with searchable details such as position, company, location, program fit, requirements, and application information. Eligible employed graduates can also submit sample job openings for Alumni Admin review. GradTrack supports access to opportunities, but does not guarantee employment."
  '10-profile.mp3' = "Graduates can review their profile, contact information, education, and current employment details. Editable profile settings help alumni keep career information current without changing the tracer survey they already submitted."
  '11-notifications.mp3' = "Notifications bring new jobs, forum activity, and announcements together, helping graduates quickly return to important updates."
  '12-outro.mp3' = "With GradTrack, Norzagaray College can maintain stronger connections with its graduates while supporting graduate tracing, alumni communication, community engagement, and access to career opportunities."
}

foreach ($clip in $clips.GetEnumerator()) {
  $output = Join-Path $audioDir $clip.Key
  Write-Host "Generating $($clip.Key)"
  py -m edge_tts --voice $voice --rate=$rate --pitch=$pitch --text $clip.Value --write-media $output
  if ($LASTEXITCODE -ne 0) {
    throw "Narration generation failed for $($clip.Key)."
  }
}

Write-Host "Narration generated in $audioDir"
