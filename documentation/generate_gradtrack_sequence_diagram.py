from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "GradTrack_Sequence_Diagram.drawio"


BLUE = "#173b80"
BLUE_LIGHT = "#dbeafe"
ORANGE = "#f97316"
ORANGE_DARK = "#ea580c"
GRAY = "#475569"
GRID = "#cbd5e1"


def xml_value(value: str) -> str:
    parts = str(value).splitlines() or [""]
    return "&lt;br&gt;".join(escape(part, {"\"": "&quot;"}) for part in parts)


class DiagramBuilder:
    def __init__(self, name: str, participants: list[dict], items: list[dict]):
        self.name = name
        self.participants = participants
        self.items = items
        self.cells: list[str] = []
        self.counter = 2
        self.page_width = max(1180, int(max(p["x"] + p.get("w", 160) / 2 for p in participants) + 80))
        self.page_height = self._compute_height()
        self.centers = {p["key"]: int(p["x"]) for p in participants}

    def _id(self, prefix: str) -> str:
        cell_id = f"{prefix}{self.counter}"
        self.counter += 1
        return cell_id

    def _compute_height(self) -> int:
        y = 124
        for item in self.items:
            if item["type"] == "section":
                y += 38
            else:
                y += 42
        return max(820, y + 92)

    def vertex(self, value: str, style: str, x: int, y: int, w: int, h: int) -> None:
        cell_id = self._id("v")
        self.cells.append(
            f'<mxCell id="{cell_id}" value="{xml_value(value)}" style="{style}" vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'
        )

    def edge(self, value: str, source_key: str, target_key: str, y: int, dashed: bool = False) -> None:
        x1 = self.centers[source_key]
        x2 = self.centers[target_key]
        style = (
            "html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;orthogonalLoop=1;jettySize=auto;"
            "labelBackgroundColor=#ffffff;fontSize=11;fontFamily=Arial;strokeWidth=1.3;"
        )
        if dashed:
            style += f"dashed=1;endArrow=open;strokeColor={GRAY};"
        else:
            style += "endArrow=block;endFill=1;strokeColor=#111827;"
            self.activation(target_key, y - 12, 32)

        cell_id = self._id("e")
        self.cells.append(
            f'<mxCell id="{cell_id}" value="{xml_value(value)}" style="{style}" edge="1" parent="1">'
            '<mxGeometry relative="1" as="geometry">'
            f'<mxPoint x="{x1}" y="{y}" as="sourcePoint"/>'
            f'<mxPoint x="{x2}" y="{y}" as="targetPoint"/>'
            "</mxGeometry></mxCell>"
        )

    def activation(self, key: str, y: int, h: int) -> None:
        x = self.centers[key] - 5
        self.vertex(
            "",
            f"rounded=0;whiteSpace=wrap;html=1;strokeColor={ORANGE_DARK};fillColor={ORANGE};",
            x,
            y,
            10,
            h,
        )

    def build(self, diagram_id: str) -> str:
        self.cells.append('<mxCell id="0"/>')
        self.cells.append('<mxCell id="1" parent="0"/>')

        self.vertex(
            self.name,
            "text;html=1;strokeColor=none;fillColor=none;fontSize=18;fontStyle=1;"
            "fontFamily=Arial;align=left;verticalAlign=middle;",
            34,
            12,
            self.page_width - 68,
            28,
        )

        header_y = 52
        header_h = 46
        for p in self.participants:
            w = p.get("w", 160)
            x = int(p["x"] - w / 2)
            self.vertex(
                p["name"],
                f"rounded=0;whiteSpace=wrap;html=1;strokeColor={BLUE};fillColor={BLUE_LIGHT};"
                "fontStyle=1;fontSize=12;fontFamily=Arial;align=center;verticalAlign=middle;",
                x,
                header_y,
                w,
                header_h,
            )

        life_start = header_y + header_h
        life_end = self.page_height - 58
        for p in self.participants:
            x = int(p["x"])
            cell_id = self._id("l")
            self.cells.append(
                f'<mxCell id="{cell_id}" value="" style="endArrow=none;startArrow=none;'
                f'dashed=1;html=1;rounded=0;strokeColor=#111827;strokeWidth=1;" edge="1" parent="1">'
                '<mxGeometry relative="1" as="geometry">'
                f'<mxPoint x="{x}" y="{life_start}" as="sourcePoint"/>'
                f'<mxPoint x="{x}" y="{life_end}" as="targetPoint"/>'
                "</mxGeometry></mxCell>"
            )

        y = 124
        for item in self.items:
            if item["type"] == "section":
                self.vertex(
                    item["label"],
                    "text;html=1;strokeColor=none;fillColor=none;fontSize=12;fontStyle=1;"
                    "fontFamily=Arial;align=left;verticalAlign=middle;",
                    38,
                    y - 14,
                    self.page_width - 76,
                    22,
                )
                y += 38
            else:
                self.edge(item["label"], item["from"], item["to"], y, item.get("return", False))
                y += 42

        model = (
            f'<mxGraphModel dx="{self.page_width}" dy="{self.page_height}" grid="1" gridSize="10" '
            f'guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
            f'pageWidth="{self.page_width}" pageHeight="{self.page_height}" math="0" shadow="0">'
            f"<root>{''.join(self.cells)}</root></mxGraphModel>"
        )
        return f'<diagram id="{diagram_id}" name="{escape(self.name, {"\"": "&quot;"})}">{model}</diagram>'


def section(label: str) -> dict:
    return {"type": "section", "label": label}


def msg(source: str, target: str, label: str) -> dict:
    return {"type": "message", "from": source, "to": target, "label": label}


def ret(source: str, target: str, label: str) -> dict:
    return {"type": "message", "from": source, "to": target, "label": label, "return": True}


def page(name: str, participants: list[tuple[str, str, int]], items: list[dict]) -> dict:
    return {
        "name": name,
        "participants": [{"key": key, "name": label, "x": x, "w": 168 if len(label) < 24 else 188} for key, label, x in participants],
        "items": items,
    }


PAGES = [
    page(
        "Overall GradTrack Sequence",
        [
            ("user", "GradTrack User / Role", 120),
            ("web", "GradTrack Web App\n(React/Vite)", 370),
            ("api", "PHP API Server", 620),
            ("db", "MySQL Database\n(gradtrackdb)", 870),
            ("ext", "External / Local Services", 1120),
        ],
        [
            section("Startup and Authentication"),
            msg("user", "web", "1. Open GradTrack responsive website"),
            msg("web", "api", "1.1 GET /settings/index.php?scope=public"),
            msg("api", "db", "1.2 Load system_settings and feature flags"),
            ret("db", "api", "1.3 Return public settings"),
            ret("api", "web", "1.4 Return branding, maintenance, feature gates"),
            ret("web", "user", "1.5 Display public, admin, or graduate route"),
            msg("user", "web", "2. Submit admin or graduate login credentials"),
            msg("web", "api", "2.1 POST /auth/login.php or /graduate-auth/login.php"),
            msg("api", "db", "2.2 Validate account, role, status, verification"),
            ret("db", "api", "2.3 Return account/session data"),
            ret("api", "web", "2.4 Return authentication result and role route"),
            ret("web", "user", "2.5 Display dashboard or Graduate Portal"),
            section("Main Implemented Workflows"),
            msg("user", "web", "3. Graduate verifies identity and submits tracer survey"),
            msg("web", "api", "3.1 POST verify/token/response endpoints"),
            msg("api", "db", "3.2 Query graduates/surveys/tokens; save survey_responses"),
            msg("api", "ext", "3.3 Optional PSGC validation and confirmation email"),
            ret("ext", "api", "3.4 Return validation/email result"),
            ret("api", "web", "3.5 Return response/account-pending result"),
            msg("user", "web", "4. Registrar manages graduate records"),
            msg("web", "api", "4.1 GET/POST/PUT/DELETE /graduates/index.php"),
            msg("api", "db", "4.2 Read/write graduates and employment; audit action"),
            ret("db", "api", "4.3 Return graduate record result"),
            ret("api", "web", "4.4 Update Manage Graduates UI"),
            msg("user", "web", "5. Admin/Dean monitors surveys and reports"),
            msg("web", "api", "5.1 Survey status, responses, reports, reminders, GenAI"),
            msg("api", "db", "5.2 Aggregate surveys, responses, programs, reports"),
            msg("api", "ext", "5.3 Send reminder email or call Groq AI when used"),
            ret("ext", "api", "5.4 Return email/AI result"),
            ret("api", "web", "5.5 Render analytics and status summaries"),
            msg("user", "web", "6. Alumni Admin verifies alumni, forum, and jobs"),
            msg("web", "api", "6.1 Alumni registry, moderation, approval endpoints"),
            msg("api", "db", "6.2 Update registry, accounts, forum_posts, job_posts; audit"),
            msg("api", "ext", "6.3 Email job poster when approved"),
            ret("api", "web", "6.4 Return moderation/approval result"),
            msg("user", "web", "7. Super Admin manages users/settings/backup/audit"),
            msg("web", "api", "7.1 Users, settings, backup, reminders, audit endpoints"),
            msg("api", "db", "7.2 Read/write admin_users, system_settings, audit_trail"),
            msg("api", "ext", "7.3 Store branding upload or send auto reminders"),
            ret("api", "web", "7.4 Return admin operation result"),
            msg("user", "web", "8. Graduate uses portal community/jobs/profile/messages"),
            msg("web", "api", "8.1 Forum, jobs, profile, notifications, chat APIs"),
            msg("api", "db", "8.2 Read/write forum, job, profile, notification tables"),
            msg("api", "ext", "8.3 Save local uploads, call Groq moderation, or Socket.IO"),
            ret("api", "web", "8.4 Return updated portal state"),
            section("Session End"),
            msg("user", "web", "9. Click logout"),
            msg("web", "api", "9.1 POST /auth/logout.php or /graduate-auth/logout.php"),
            msg("api", "db", "9.2 Log admin logout when role is auditable"),
            ret("api", "web", "9.3 Destroy session and return success"),
            ret("web", "user", "9.4 Redirect to sign-in page"),
        ],
    ),
    page(
        "Authentication and Password Reset",
        [
            ("user", "Admin or Graduate", 120),
            ("web", "GradTrack Web App", 360),
            ("auth", "Auth API\n(PHP)", 600),
            ("db", "MySQL Database", 840),
            ("mail", "Email Service\n(PHPMailer/SMTP)", 1080),
        ],
        [
            section("Login and Session Check"),
            msg("user", "web", "1. Enter credentials"),
            msg("web", "auth", "1.1 POST login endpoint"),
            msg("auth", "db", "1.2 Admin: hardcoded super_admin or admin_users"),
            msg("auth", "db", "1.3 Graduate: graduate_accounts + approval status"),
            ret("db", "auth", "1.4 Return account, role, status, profile image"),
            ret("auth", "web", "1.5 Set PHP session and return user"),
            ret("web", "user", "1.6 Navigate to role dashboard or Graduate Portal"),
            msg("web", "auth", "2. GET auth/check.php or graduate-auth/check.php"),
            msg("auth", "db", "2.1 Reload current user/profile context"),
            ret("db", "auth", "2.2 Return authenticated user"),
            ret("auth", "web", "2.3 Allow protected route or show maintenance"),
            section("Forgot Password OTP"),
            msg("user", "web", "3. Request password reset OTP"),
            msg("web", "auth", "3.1 POST forgot-password action=send_otp"),
            msg("auth", "db", "3.2 Insert password reset token"),
            msg("auth", "mail", "3.3 Send OTP email"),
            ret("mail", "auth", "3.4 Mail send result"),
            ret("auth", "web", "3.5 Return OTP sent"),
            msg("user", "web", "4. Submit OTP"),
            msg("web", "auth", "4.1 POST forgot-password action=verify_otp"),
            msg("auth", "db", "4.2 Validate token, OTP, expiry, attempts"),
            ret("db", "auth", "4.3 Return verified token"),
            ret("auth", "web", "4.4 Allow password reset form"),
            msg("user", "web", "5. Submit new password"),
            msg("web", "auth", "5.1 POST forgot-password action=reset_password"),
            msg("auth", "db", "5.2 Update password hash; mark reset used"),
            ret("db", "auth", "5.3 Password updated"),
            ret("auth", "web", "5.4 Return reset success"),
            section("Logout"),
            msg("user", "web", "6. Confirm logout"),
            msg("web", "auth", "6.1 POST logout endpoint"),
            msg("auth", "db", "6.2 Insert audit log for admin role"),
            ret("db", "auth", "6.3 Audit result"),
            ret("auth", "web", "6.4 Clear session cookie/session data"),
            ret("web", "user", "6.5 Redirect to sign-in page"),
        ],
    ),
    page(
        "Graduate Survey and Account Sequence",
        [
            ("grad", "Graduate / Alumni", 120),
            ("web", "GradTrack Web App", 360),
            ("survey", "Survey and Graduate Auth APIs", 620),
            ("db", "MySQL Database", 880),
            ("psgc", "PSGC API", 1130),
            ("mail", "Email Service\n(PHPMailer/SMTP)", 1370),
        ],
        [
            section("Survey Verification"),
            msg("grad", "web", "1. Open /survey-verify"),
            msg("web", "survey", "1.1 GET /surveys/index.php and /surveys/programs.php"),
            msg("survey", "db", "1.2 Query active survey and programs"),
            ret("db", "survey", "1.3 Return survey/program list"),
            ret("survey", "web", "1.4 Render verification form"),
            msg("grad", "web", "2. Enter student/email, last name, program"),
            msg("web", "survey", "2.1 POST /surveys/verify.php"),
            msg("survey", "db", "2.2 Match graduates + programs"),
            msg("survey", "db", "2.3 Check survey status, existing response, token"),
            msg("survey", "db", "2.4 Insert or reuse survey_tokens row"),
            ret("db", "survey", "2.5 Return survey_token and graduate profile"),
            ret("survey", "web", "2.6 Navigate to /survey with token"),
            section("Survey Completion"),
            msg("web", "survey", "3. POST /surveys/validate-token.php"),
            msg("survey", "db", "3.1 Verify token, active survey, duplicate guard"),
            ret("db", "survey", "3.2 Return token profile"),
            ret("survey", "web", "3.3 Load survey profile"),
            msg("web", "survey", "3.4 GET /surveys/index.php?id=survey_id"),
            msg("survey", "db", "3.5 Query survey and survey_questions"),
            ret("db", "survey", "3.6 Return questions"),
            ret("survey", "web", "3.7 Render survey form"),
            msg("web", "psgc", "4. Load PSGC region/province/city/barangay options"),
            ret("psgc", "web", "4.1 Return address options"),
            msg("grad", "web", "5. Submit tracer survey"),
            msg("web", "survey", "5.1 POST /surveys/responses.php"),
            msg("survey", "psgc", "5.2 Validate submitted PSGC address when present"),
            ret("psgc", "survey", "5.3 Return canonical address or validation error"),
            msg("survey", "db", "5.4 Insert survey_responses; update survey_tokens"),
            ret("db", "survey", "5.5 Return response ID"),
            msg("survey", "mail", "5.6 Send survey confirmation email"),
            ret("mail", "survey", "5.7 Return email status"),
            ret("survey", "web", "5.8 Return survey_response_id"),
            ret("web", "grad", "5.9 Show completion/account prompt"),
            section("Graduate Portal Account Creation"),
            msg("grad", "web", "6. Submit account form after survey"),
            msg("web", "survey", "6.1 POST /graduate-auth/register-from-survey.php"),
            msg("survey", "db", "6.2 Validate response, graduate, duplicate account/email"),
            msg("survey", "db", "6.3 Update graduates; insert pending graduate_accounts"),
            msg("survey", "db", "6.4 Sync registered_alumni; link survey_response"),
            ret("db", "survey", "6.5 Return pending account data"),
            ret("survey", "web", "6.6 Return pending alumni verification"),
            ret("web", "grad", "6.7 Display pending verification message"),
            section("Access After Alumni Admin Approval"),
            msg("grad", "web", "7. Sign in to Graduate Portal"),
            msg("web", "survey", "7.1 POST /graduate-auth/login.php"),
            msg("survey", "db", "7.2 Verify password, status=active, approval=approved"),
            ret("db", "survey", "7.3 Return verified graduate user"),
            ret("survey", "web", "7.4 Create graduate session"),
            ret("web", "grad", "7.5 Display /graduate/portal"),
        ],
    ),
    page(
        "Graduate Portal Community Jobs Notifications",
        [
            ("grad", "Graduate / Alumni", 120),
            ("web", "GradTrack Web App", 360),
            ("api", "Graduate Portal APIs\n(PHP)", 620),
            ("db", "MySQL Database", 880),
            ("store", "Local Upload Storage\nbackend/uploads", 1130),
            ("groq", "Groq AI API", 1370),
        ],
        [
            section("Portal Load and Profile"),
            msg("grad", "web", "1. Open /graduate/portal"),
            msg("web", "api", "1.1 GET rating, posts, jobs, chats, profile"),
            msg("api", "db", "1.2 Query survey, employment, forum, job, profile tables"),
            ret("db", "api", "1.3 Return portal data and permissions"),
            ret("api", "web", "1.4 Render dashboard and tabs"),
            msg("grad", "web", "2. Update profile or password/photo"),
            msg("web", "api", "2.1 POST /graduate-profile/index.php FormData"),
            msg("api", "db", "2.2 Validate email/password and current account"),
            msg("api", "store", "2.3 Save profile/cover image when uploaded"),
            ret("store", "api", "2.4 Return file path"),
            msg("api", "db", "2.5 Update graduates, graduate_accounts, image rows"),
            ret("db", "api", "2.6 Return updated profile"),
            ret("api", "web", "2.7 Refresh profile UI"),
            section("Community Forum"),
            msg("grad", "web", "3. Compose forum post with optional media"),
            msg("web", "api", "3.1 POST /forum/ai-moderate.php"),
            msg("api", "groq", "3.2 Keyword check; call Groq when configured"),
            ret("groq", "api", "3.3 Return moderation result"),
            ret("api", "web", "3.4 Allow or block submission"),
            msg("web", "api", "3.5 POST /forum/posts.php FormData"),
            msg("api", "db", "3.6 Insert forum_posts status=approved for new post"),
            msg("api", "store", "3.7 Save forum media files"),
            ret("store", "api", "3.8 Return media file paths"),
            msg("api", "db", "3.9 Insert forum_post_media rows"),
            ret("db", "api", "3.10 Return saved post"),
            ret("api", "web", "3.11 Refresh forum feed"),
            msg("grad", "web", "4. Like, comment, or report content"),
            msg("web", "api", "4.1 POST likes/comments/reports endpoints"),
            msg("api", "db", "4.2 Update likes/comments/reports and activity logs"),
            ret("db", "api", "4.3 Return updated counts/comments"),
            ret("api", "web", "4.4 Update discussion UI"),
            section("Job Support"),
            msg("grad", "web", "5. Browse approved job posts"),
            msg("web", "api", "5.1 GET /jobs/posts.php"),
            msg("api", "db", "5.2 Query active approved job_posts"),
            ret("db", "api", "5.3 Return job list"),
            ret("api", "web", "5.4 Render jobs tab"),
            msg("grad", "web", "6. Submit job post"),
            msg("web", "api", "6.1 POST /jobs/posts.php FormData"),
            msg("api", "db", "6.2 Check rating permission and contact fields"),
            msg("api", "store", "6.3 Save requirements file when uploaded"),
            ret("store", "api", "6.4 Return file path"),
            msg("api", "db", "6.5 Insert job_posts approval_status=pending"),
            ret("db", "api", "6.6 Return pending job post"),
            ret("api", "web", "6.7 Show pending approval"),
            section("Notifications"),
            msg("web", "api", "7. GET /notifications/index.php?audience=graduate"),
            msg("api", "db", "7.1 Build notifications from surveys, forum, jobs, announcements"),
            ret("db", "api", "7.2 Return notifications plus read markers"),
            ret("api", "web", "7.3 Show unread count/list"),
            msg("web", "api", "7.4 POST notifications mark_read or mark_all_read"),
            msg("api", "db", "7.5 Upsert notification_reads"),
            ret("api", "web", "7.6 Update notification state"),
        ],
    ),
    page(
        "Realtime Messaging Sequence",
        [
            ("ga", "Graduate A", 100),
            ("web", "GradTrack Web App", 330),
            ("php", "PHP Chat APIs", 560),
            ("socket", "Socket.IO Server\nNode.js", 790),
            ("db", "MySQL Database", 1020),
            ("store", "Local Upload Storage", 1250),
            ("gb", "Graduate B", 1480),
        ],
        [
            section("REST Chat Setup"),
            msg("ga", "web", "1. Open Messages or Group Chats tab"),
            msg("web", "php", "1.1 GET /forum/chats.php"),
            msg("php", "db", "1.2 Verify graduate session; query rooms and directory"),
            ret("db", "php", "1.3 Return rooms, participants, unread counts"),
            ret("php", "web", "1.4 Render chat list and directory"),
            msg("ga", "web", "2. Start direct or group chat"),
            msg("web", "php", "2.1 POST /forum/chats.php"),
            msg("php", "db", "2.2 Validate active graduates; find/create room and members"),
            ret("db", "php", "2.3 Return room_id"),
            ret("php", "web", "2.4 Select room"),
            msg("web", "php", "3. GET /forum/chat-messages.php?room_id"),
            msg("php", "db", "3.1 Verify room membership; load messages and attachments"),
            ret("db", "php", "3.2 Return message history"),
            ret("php", "web", "3.3 Display conversation"),
            section("Socket Authentication and Presence"),
            msg("web", "socket", "4. Connect Socket.IO with PHP session cookie"),
            msg("socket", "php", "4.1 GET /graduate-auth/check.php using cookie"),
            msg("php", "db", "4.2 Validate approved graduate account"),
            ret("db", "php", "4.3 Return graduate user"),
            ret("php", "socket", "4.4 Authenticate socket"),
            msg("socket", "db", "4.5 Upsert graduate_presence and join user room"),
            ret("socket", "web", "4.6 Emit unread/conversation state"),
            section("Realtime Message Send"),
            msg("ga", "web", "5. Attach file or type message"),
            msg("web", "php", "5.1 Optional XHR POST /forum/chat-attachments.php"),
            msg("php", "store", "5.2 Save attachment in uploads/chat-attachments"),
            ret("store", "php", "5.3 Return storage path"),
            msg("php", "db", "5.4 Insert unclaimed attachment row"),
            ret("php", "web", "5.5 Return attachment_id"),
            msg("web", "socket", "6. Emit message:send"),
            msg("socket", "db", "6.1 Verify room member, insert forum_chat_messages"),
            msg("socket", "db", "6.2 Claim attachments and update last_message_at"),
            ret("db", "socket", "6.3 Return saved message"),
            ret("socket", "web", "6.4 Emit message:confirmed to sender"),
            msg("socket", "gb", "6.5 Emit message:new to recipient room/user room"),
            msg("socket", "db", "6.6 Update unread summaries/delivery/read state"),
            ret("socket", "web", "6.7 Emit conversation/unread updates"),
            section("Fallback and Receipts"),
            msg("web", "php", "7. If socket unavailable, POST /forum/chat-messages.php"),
            msg("php", "db", "7.1 Insert message or mark messages read"),
            ret("db", "php", "7.2 Return saved/read rows"),
            ret("php", "web", "7.3 Apply fallback result"),
            msg("web", "socket", "8. Emit typing:start/stop or message:read"),
            msg("socket", "db", "8.1 Verify membership; update read/delivery data"),
            msg("socket", "gb", "8.2 Broadcast typing/read receipt"),
            ret("socket", "web", "8.3 Acknowledge event"),
        ],
    ),
    page(
        "Registrar Graduate Records Sequence",
        [
            ("reg", "Registrar", 120),
            ("web", "GradTrack Web App", 360),
            ("auth", "Auth API", 600),
            ("gradapi", "Graduates API", 840),
            ("db", "MySQL Database", 1080),
        ],
        [
            section("Registrar Access"),
            msg("reg", "web", "1. Enter registrar credentials"),
            msg("web", "auth", "1.1 POST /auth/login.php"),
            msg("auth", "db", "1.2 Query admin_users and require role=registrar"),
            ret("db", "auth", "1.3 Return active registrar account"),
            ret("auth", "web", "1.4 Create admin session"),
            ret("web", "reg", "1.5 Navigate to /admin/graduates"),
            section("Manage Graduate Records"),
            msg("web", "gradapi", "2. GET /graduates/index.php with filters"),
            msg("gradapi", "db", "2.1 Verify session role=registrar"),
            msg("gradapi", "db", "2.2 Query graduates, programs, employment"),
            ret("db", "gradapi", "2.3 Return paginated records"),
            ret("gradapi", "web", "2.4 Display Manage Graduates table"),
            msg("reg", "web", "3. Submit add/edit graduate form"),
            msg("web", "gradapi", "3.1 POST or PUT /graduates/index.php"),
            msg("gradapi", "db", "3.2 Check duplicate student_id/email"),
            msg("gradapi", "db", "3.3 Insert/update graduates and employment"),
            msg("gradapi", "db", "3.4 Insert audit_trail for Graduate Records"),
            ret("db", "gradapi", "3.5 Return save result"),
            ret("gradapi", "web", "3.6 Refresh graduate records"),
            section("Browser-Side Import and Delete"),
            msg("reg", "web", "4. Select Excel file for import"),
            msg("web", "web", "4.1 Parse XLSX rows in browser and map fields"),
            msg("web", "gradapi", "4.2 POST each mapped row to /graduates/index.php"),
            msg("gradapi", "db", "4.3 Save graduate/employment row and audit"),
            ret("gradapi", "web", "4.4 Return per-row result"),
            msg("reg", "web", "5. Delete selected or filtered records"),
            msg("web", "gradapi", "5.1 DELETE /graduates/index.php"),
            msg("gradapi", "db", "5.2 Delete graduates by ids/year/program"),
            msg("gradapi", "db", "5.3 Insert audit_trail delete record"),
            ret("db", "gradapi", "5.4 Return deleted count"),
            ret("gradapi", "web", "5.5 Refresh table"),
        ],
    ),
    page(
        "Admin Dean Survey Reports GenAI",
        [
            ("actor", "Admin or Dean", 120),
            ("web", "GradTrack Web App", 360),
            ("survey", "Survey / Status APIs", 600),
            ("reports", "Reports / GenAI APIs", 840),
            ("db", "MySQL Database", 1080),
            ("mail", "Email Service", 1320),
            ("ai", "Groq AI / QuickChart", 1560),
        ],
        [
            section("Survey Management and Participation"),
            msg("actor", "web", "1. Open admin survey, reports, or dean status route"),
            msg("web", "survey", "1.1 GET /auth/check.php through protected route"),
            ret("survey", "web", "1.2 Role guard allows admin or dean page"),
            msg("web", "survey", "2. GET /surveys/index.php"),
            msg("survey", "db", "2.1 Query surveys, questions, response counts"),
            ret("db", "survey", "2.2 Return surveys"),
            ret("survey", "web", "2.3 Render survey list"),
            msg("actor", "web", "3. Admin creates/updates/deletes survey"),
            msg("web", "survey", "3.1 POST/PUT/DELETE /surveys/index.php"),
            msg("survey", "db", "3.2 Write surveys and survey_questions"),
            msg("survey", "db", "3.3 Insert audit_trail Survey Management"),
            ret("db", "survey", "3.4 Return save/delete result"),
            ret("survey", "web", "3.5 Refresh survey UI"),
            msg("web", "survey", "4. GET graduate or dean survey status"),
            msg("survey", "db", "4.1 Compare graduates with survey_responses"),
            msg("survey", "db", "4.2 Apply dean program scope when role is dean"),
            ret("db", "survey", "4.3 Return answered/not answered summary"),
            ret("survey", "web", "4.4 Display participation table"),
            msg("actor", "web", "5. View graduate answers"),
            msg("web", "survey", "5.1 GET /surveys/responses.php"),
            msg("survey", "db", "5.2 Query responses and survey_questions; apply role scope"),
            ret("db", "survey", "5.3 Return mapped answers"),
            ret("survey", "web", "5.4 Open answer viewer"),
            msg("actor", "web", "6. Send survey reminders"),
            msg("web", "survey", "6.1 POST /graduates/notify.php"),
            msg("survey", "db", "6.2 Select eligible graduates without responses"),
            msg("survey", "mail", "6.3 Send reminder emails with survey link"),
            ret("mail", "survey", "6.4 Return mail results"),
            msg("survey", "db", "6.5 Insert survey_reminder_logs"),
            ret("survey", "web", "6.6 Return sent/failed/skipped counts"),
            section("Reports, Analytics, and GenAI"),
            msg("actor", "web", "7. Open Reports & Analytics"),
            msg("web", "reports", "7.1 GET /reports/index.php?type=..."),
            msg("reports", "db", "7.2 Aggregate survey_responses, questions, programs, employment"),
            ret("db", "reports", "7.3 Return analytics dataset"),
            ret("reports", "web", "7.4 Render charts and tables"),
            msg("web", "reports", "8. GET /surveys/analytics.php when survey selected"),
            msg("reports", "db", "8.1 Build per-question/employment analytics"),
            ret("reports", "web", "8.2 Return survey analytics"),
            msg("actor", "web", "9. Request AI report or insight"),
            msg("web", "reports", "9.1 POST /reports/ai-analytics.php or /genai/assistant.php"),
            msg("reports", "db", "9.2 Build authorized aggregate dataset"),
            msg("reports", "ai", "9.3 Call Groq if API key/model path is used"),
            ret("ai", "reports", "9.4 Return AI completion or fallback unavailable"),
            msg("reports", "db", "9.5 Insert audit_trail for Reports/GenAI"),
            ret("reports", "web", "9.6 Display AI insight/report draft"),
            msg("web", "ai", "10. Optional PDF chart image request to QuickChart"),
            ret("ai", "web", "10.1 Return chart image for client-side PDF"),
        ],
    ),
    page(
        "Alumni Admin Verification Moderation",
        [
            ("aa", "Alumni Admin", 120),
            ("web", "GradTrack Web App", 360),
            ("registry", "Alumni Registry API", 600),
            ("forum", "Forum Moderation API", 840),
            ("jobs", "Job Approval API", 1080),
            ("db", "MySQL Database", 1320),
            ("mail", "Email / Local Storage", 1560),
        ],
        [
            section("Official Alumni Registry and Account Review"),
            msg("aa", "web", "1. Open /admin/alumni-registered-list"),
            msg("web", "registry", "1.1 GET /alumni-registry/index.php actions summary/list/pending_accounts"),
            msg("registry", "db", "1.2 Verify alumni_admin session"),
            msg("registry", "db", "1.3 Query registered_alumni, graduate_accounts, graduates"),
            ret("db", "registry", "1.4 Return registry records and review queue"),
            ret("registry", "web", "1.5 Display alumni verification workspace"),
            msg("aa", "web", "2. Import official alumni list"),
            msg("web", "web", "2.1 Parse XLSX/CSV rows in browser"),
            msg("web", "registry", "2.2 POST /alumni-registry/index.php?action=preview"),
            msg("registry", "db", "2.3 Validate courses, batch years, duplicates"),
            ret("db", "registry", "2.4 Return preview result"),
            ret("registry", "web", "2.5 Display valid/duplicate/invalid rows"),
            msg("web", "registry", "2.6 POST /alumni-registry/index.php?action=import"),
            msg("registry", "db", "2.7 Insert alumni_import_history and registered_alumni"),
            msg("registry", "db", "2.8 Insert audit_trail import record"),
            ret("registry", "web", "2.9 Return import summary"),
            msg("aa", "web", "3. Approve or reject pending Graduate Portal account"),
            msg("web", "registry", "3.1 PUT /alumni-registry/index.php?action=approve_account/reject_account"),
            msg("registry", "db", "3.2 Update graduate_accounts verification/status"),
            msg("registry", "db", "3.3 Verify/link or unlink registered_alumni"),
            msg("registry", "db", "3.4 Insert audit_trail Alumni Account Verification"),
            ret("registry", "web", "3.5 Return approval/rejection result"),
            msg("aa", "web", "4. Update/link/verify/inactivate registry record"),
            msg("web", "registry", "4.1 PUT/DELETE /alumni-registry/index.php update/link/unlink/verify/inactive"),
            msg("registry", "db", "4.2 Update registered_alumni and linked account status"),
            msg("registry", "db", "4.3 Insert audit_trail Alumni Registered List"),
            ret("registry", "web", "4.4 Refresh registry UI"),
            section("Forum and Job Moderation"),
            msg("aa", "web", "5. Open Forum Moderation"),
            msg("web", "forum", "5.1 GET /forum/moderation.php"),
            msg("forum", "db", "5.2 Query forum_posts, comments, reports, media"),
            ret("db", "forum", "5.3 Return moderation queue"),
            ret("forum", "web", "5.4 Display posts/comments/reports"),
            msg("aa", "web", "6. Approve, hide, pend, or delete forum content"),
            msg("web", "forum", "6.1 PUT status or DELETE post/comment"),
            msg("forum", "db", "6.2 Update forum_posts/comments; delete records when needed"),
            msg("forum", "mail", "6.3 Remove local media files when deleting posts"),
            msg("forum", "db", "6.4 Insert audit_trail Community Forum"),
            ret("forum", "web", "6.5 Return moderation result"),
            msg("aa", "web", "7. Open Job Approval"),
            msg("web", "jobs", "7.1 GET /moderation/approvals.php"),
            msg("jobs", "db", "7.2 Query job_posts by approval_status"),
            ret("db", "jobs", "7.3 Return job approval queue and counts"),
            ret("jobs", "web", "7.4 Display job cards"),
            msg("aa", "web", "8. Approve or decline job post"),
            msg("web", "jobs", "8.1 PUT approval_status approved/declined"),
            msg("jobs", "db", "8.2 Update job_posts approval fields"),
            msg("jobs", "mail", "8.3 If approved, email job poster"),
            ret("mail", "jobs", "8.4 Return email status"),
            msg("jobs", "db", "8.5 Insert audit_trail Job Posting"),
            ret("jobs", "web", "8.6 Return approval result"),
        ],
    ),
    page(
        "Super Admin Operations Sequence",
        [
            ("sa", "Super Admin", 120),
            ("web", "GradTrack Web App", 360),
            ("auth", "Auth API", 600),
            ("api", "Super Admin APIs", 840),
            ("db", "MySQL Database", 1080),
            ("store", "Local Upload Storage", 1320),
            ("mail", "Email Service", 1560),
        ],
        [
            section("Access and User Management"),
            msg("sa", "web", "1. Enter Super Admin credentials"),
            msg("web", "auth", "1.1 POST /auth/login.php"),
            msg("auth", "db", "1.2 Hardcoded super_admin or admin_users role check"),
            ret("db", "auth", "1.3 Return Super Admin session context"),
            ret("auth", "web", "1.4 Navigate to /admin/user-management"),
            msg("web", "api", "2. GET /users/index.php with filters"),
            msg("api", "db", "2.1 Verify role=super_admin; query admin_users"),
            ret("db", "api", "2.2 Return user accounts"),
            ret("api", "web", "2.3 Display User Management"),
            msg("sa", "web", "3. Create/update/suspend/delete admin user"),
            msg("web", "api", "3.1 POST/PUT/DELETE /users/index.php"),
            msg("api", "db", "3.2 Validate allowed role; write admin_users"),
            msg("api", "db", "3.3 Insert audit_trail User Management"),
            ret("api", "web", "3.4 Return user operation result"),
            section("System Settings and Branding"),
            msg("web", "api", "4. GET /settings/index.php"),
            msg("api", "db", "4.1 Load system_settings"),
            ret("api", "web", "4.2 Return grouped editable settings"),
            msg("sa", "web", "5. Upload logo/favicon/login image"),
            msg("web", "api", "5.1 POST /settings/index.php?action=upload"),
            msg("api", "store", "5.2 Save image in uploads/system-branding"),
            ret("store", "api", "5.3 Return file path"),
            msg("api", "db", "5.4 Save setting path and audit"),
            ret("api", "web", "5.5 Update branding preview"),
            msg("sa", "web", "6. Save system settings"),
            msg("web", "api", "6.1 PUT /settings/index.php"),
            msg("api", "db", "6.2 Upsert system_settings and audit update"),
            ret("api", "web", "6.3 Refresh public settings cache"),
            section("Backup, Reminders, and Audit Trail"),
            msg("web", "api", "7. GET /backup/index.php?action=summary"),
            msg("api", "db", "7.1 Query INFORMATION_SCHEMA and table counts"),
            ret("db", "api", "7.2 Return backup summary"),
            ret("api", "web", "7.3 Display database backup details"),
            msg("sa", "web", "8. Download SQL backup"),
            msg("web", "api", "8.1 GET /backup/index.php?action=download"),
            msg("api", "db", "8.2 SHOW CREATE TABLE and stream INSERT batches"),
            ret("api", "web", "8.3 Download .sql file"),
            msg("web", "api", "9. GET auto-reminder status/logs/eligible"),
            msg("api", "db", "9.1 Query active survey, nonrespondents, logs, settings"),
            ret("api", "web", "9.2 Return reminder dashboard data"),
            msg("sa", "web", "10. Send/update auto reminders"),
            msg("web", "api", "10.1 POST /super-admin/auto-reminders.php"),
            msg("api", "db", "10.2 Select eligible graduates or update interval setting"),
            msg("api", "mail", "10.3 Send reminder emails when action=send_reminders"),
            ret("mail", "api", "10.4 Return sent/failed status"),
            msg("api", "db", "10.5 Insert survey_reminder_logs or update system_settings"),
            ret("api", "web", "10.6 Return counts/settings"),
            msg("web", "api", "11. GET /get_audit_trail.php filters/export=csv"),
            msg("api", "db", "11.1 Verify Super Admin and query audit_trail"),
            msg("api", "db", "11.2 If export, insert Audit Trail export log"),
            ret("db", "api", "11.3 Return logs or CSV rows"),
            ret("api", "web", "11.4 Display logs or download CSV"),
        ],
    ),
]


def build_drawio(pages: Iterable[dict]) -> str:
    diagrams = []
    for index, p in enumerate(pages, start=1):
        builder = DiagramBuilder(p["name"], p["participants"], p["items"])
        diagrams.append(builder.build(f"gradtrack-sequence-{index}"))

    modified = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return (
        f'<mxfile host="app.diagrams.net" modified="{modified}" agent="Codex" '
        'version="24.7.17" type="device">'
        f"{''.join(diagrams)}</mxfile>\n"
    )


def main() -> None:
    OUT.write_text(build_drawio(PAGES), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
