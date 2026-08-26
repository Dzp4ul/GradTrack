from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "GradTrack_Sequence_Diagram_Revised.drawio"

PAGE_WIDTH = 1100
PAGE_HEIGHT = 850
TITLE_Y = 16
HEADER_Y = 62
HEADER_H = 46
LIFELINE_TOP = HEADER_Y + HEADER_H
LIFELINE_BOTTOM = 812
START_Y = 140
SECTION_GAP = 26
ROW_GAP = 43
LABEL_H = 30

BLUE = "#173b80"
BLUE_LIGHT = "#dbeafe"
ORANGE = "#f97316"
ORANGE_DARK = "#ea580c"
GRAY = "#475569"
LIGHT_BAND = "#f8fafc"


def text_value(value: str) -> str:
    parts = str(value).splitlines() or [""]
    return "&lt;br&gt;".join(escape(part, {"\"": "&quot;"}) for part in parts)


def attr_value(value: str) -> str:
    return escape(str(value), {"\"": "&quot;"})


class DiagramBuilder:
    def __init__(self, name: str, participants: list[dict], items: list[dict]):
        self.name = name
        self.participants = participants
        self.items = items
        self.cells: list[str] = []
        self.counter = 2
        self.centers = {p["key"]: int(p["x"]) for p in participants}

    def _id(self, prefix: str) -> str:
        cell_id = f"{prefix}{self.counter}"
        self.counter += 1
        return cell_id

    def vertex(self, value: str, style: str, x: int, y: int, w: int, h: int) -> str:
        cell_id = self._id("v")
        self.cells.append(
            f'<mxCell id="{cell_id}" value="{text_value(value)}" style="{style}" vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'
        )
        return cell_id

    def edge(self, source_key: str, target_key: str, y: int, dashed: bool = False) -> None:
        x1 = self.centers[source_key]
        x2 = self.centers[target_key]
        style = (
            "html=1;rounded=0;edgeStyle=none;orthogonalLoop=1;jettySize=auto;"
            "strokeWidth=1.6;"
        )
        if dashed:
            style += f"dashed=1;endArrow=open;strokeColor={GRAY};"
        else:
            style += "endArrow=block;endFill=1;strokeColor=#111827;"
            self.activation(target_key, y - 14, 32)

        cell_id = self._id("e")
        self.cells.append(
            f'<mxCell id="{cell_id}" value="" style="{style}" edge="1" parent="1">'
            '<mxGeometry relative="1" as="geometry">'
            f'<mxPoint x="{x1}" y="{y}" as="sourcePoint"/>'
            f'<mxPoint x="{x2}" y="{y}" as="targetPoint"/>'
            "</mxGeometry></mxCell>"
        )

    def label(self, value: str, source_key: str, target_key: str, y: int) -> None:
        x1 = self.centers[source_key]
        x2 = self.centers[target_key]
        left = min(x1, x2) + 8
        width = max(92, abs(x2 - x1) - 16)
        style = (
            "rounded=0;whiteSpace=wrap;html=1;strokeColor=none;fillColor=#ffffff;"
            "fontSize=14;fontFamily=Arial;align=center;verticalAlign=middle;"
            "spacing=2;overflow=hidden;"
        )
        self.vertex(value, style, left, y - LABEL_H, width, LABEL_H)

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

    def message(self, item: dict, y: int) -> None:
        self.edge(item["src"], item["dst"], y, dashed=item.get("dashed", False))
        self.label(item["text"], item["src"], item["dst"], y)

    def section(self, value: str, y: int) -> None:
        style = (
            f"rounded=0;whiteSpace=wrap;html=1;strokeColor=#cbd5e1;fillColor={LIGHT_BAND};"
            "fontSize=15;fontStyle=1;fontFamily=Arial;align=left;verticalAlign=middle;"
            "spacingLeft=8;"
        )
        self.vertex(value, style, 34, y - 18, PAGE_WIDTH - 68, 22)

    def build(self, diagram_id: str) -> str:
        self.cells.append('<mxCell id="0"/>')
        self.cells.append('<mxCell id="1" parent="0"/>')

        self.vertex(
            self.name,
            "text;html=1;strokeColor=none;fillColor=none;fontSize=20;fontStyle=1;"
            "fontFamily=Arial;align=left;verticalAlign=middle;",
            34,
            TITLE_Y,
            PAGE_WIDTH - 68,
            28,
        )

        header_style = (
            f"rounded=0;whiteSpace=wrap;html=1;strokeColor={BLUE};fillColor={BLUE_LIGHT};"
            "fontStyle=1;fontSize=15;fontFamily=Arial;align=center;verticalAlign=middle;"
        )
        for participant in self.participants:
            width = participant.get("w", 140)
            self.vertex(
                participant["name"],
                header_style,
                int(participant["x"] - width / 2),
                HEADER_Y,
                width,
                HEADER_H,
            )

        for participant in self.participants:
            x = int(participant["x"])
            cell_id = self._id("l")
            self.cells.append(
                f'<mxCell id="{cell_id}" value="" style="endArrow=none;startArrow=none;dashed=1;'
                'html=1;rounded=0;strokeColor=#111827;strokeWidth=1;" edge="1" parent="1">'
                '<mxGeometry relative="1" as="geometry">'
                f'<mxPoint x="{x}" y="{LIFELINE_TOP}" as="sourcePoint"/>'
                f'<mxPoint x="{x}" y="{LIFELINE_BOTTOM}" as="targetPoint"/>'
                "</mxGeometry></mxCell>"
            )

        y = START_Y
        for item in self.items:
            if item["type"] == "section":
                self.section(item["text"], y)
                y += SECTION_GAP
            else:
                self.message(item, y)
                y += ROW_GAP

        if y > PAGE_HEIGHT - 12:
            raise ValueError(f"{self.name} is too tall for Letter landscape: y={y}")

        model = (
            f'<mxGraphModel dx="{PAGE_WIDTH}" dy="{PAGE_HEIGHT}" grid="1" gridSize="10" guides="1" '
            f'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
            f'pageWidth="{PAGE_WIDTH}" pageHeight="{PAGE_HEIGHT}" math="0" shadow="0">'
            f"<root>{''.join(self.cells)}</root></mxGraphModel>"
        )
        return f'<diagram id="{diagram_id}" name="{attr_value(self.name)}">{model}</diagram>'


def sec(text: str) -> dict:
    return {"type": "section", "text": text}


def msg(src: str, dst: str, text: str) -> dict:
    return {"type": "message", "src": src, "dst": dst, "text": text, "dashed": False}


def ret(src: str, dst: str, text: str) -> dict:
    return {"type": "message", "src": src, "dst": dst, "text": text, "dashed": True}


def page(name: str, participants: list[tuple], items: list[dict]) -> dict:
    normalized = []
    for item in participants:
        key, label, x = item[:3]
        width = item[3] if len(item) > 3 else 140
        normalized.append({"key": key, "name": label, "x": x, "w": width})
    return {"name": name, "participants": normalized, "items": items}


PAGES = [
    page(
        "Authentication Login and Logout Flow",
        [
            ("user", "Admin / Graduate", 80, 150),
            ("web", "GradTrack Web App", 315, 160),
            ("auth", "Auth API", 550, 140),
            ("db", "MySQL Database", 785, 150),
            ("route", "Role Dashboard", 1020, 140),
        ],
        [
            sec("Session Check"),
            msg("user", "web", "1. Open sign-in page"),
            msg("web", "auth", "1.1 GET check endpoint"),
            ret("auth", "web", "1.2 Return session state"),
            sec("Login"),
            msg("user", "web", "2. Enter credentials"),
            msg("web", "auth", "2.1 POST login request"),
            msg("auth", "db", "2.2 Query account and role"),
            ret("db", "auth", "2.3 Return account status"),
            ret("auth", "web", "2.4 Return authenticated user"),
            ret("web", "route", "2.5 Redirect by role"),
            ret("route", "user", "2.6 Display dashboard"),
            sec("Logout"),
            msg("user", "web", "3. Click logout"),
            msg("web", "auth", "3.1 POST logout request"),
            msg("auth", "db", "3.2 Save logout audit"),
            ret("auth", "web", "3.3 Clear session result"),
        ],
    ),
    page(
        "Password Reset Flow",
        [
            ("user", "Admin / Graduate", 80, 150),
            ("web", "GradTrack Web App", 315, 160),
            ("reset", "Forgot Password API", 550, 170),
            ("db", "MySQL Database", 785, 150),
            ("mail", "Email Service", 1020, 140),
        ],
        [
            sec("OTP Request"),
            msg("user", "web", "1. Request password reset"),
            msg("web", "reset", "1.1 POST send_otp"),
            msg("reset", "db", "1.2 Store reset OTP"),
            msg("reset", "mail", "1.3 Send OTP email"),
            ret("reset", "web", "1.4 Show OTP prompt"),
            sec("OTP Verification"),
            msg("user", "web", "2. Enter OTP"),
            msg("web", "reset", "2.1 POST verify_otp"),
            msg("reset", "db", "2.2 Validate active OTP"),
            ret("reset", "web", "2.3 Show new password form"),
            sec("Password Update"),
            msg("user", "web", "3. Submit new password"),
            msg("web", "reset", "3.1 POST reset_password"),
            msg("reset", "db", "3.2 Update password hash"),
            ret("reset", "web", "3.3 Confirm reset success"),
        ],
    ),
    page(
        "Survey Verification Flow",
        [
            ("grad", "Graduate", 100, 140),
            ("web", "Survey Verify Page", 365, 170),
            ("api", "Survey API", 630, 140),
            ("db", "MySQL Database", 895, 150),
        ],
        [
            sec("Load Active Survey"),
            msg("grad", "web", "1. Open /survey-verify"),
            msg("web", "api", "1.1 GET survey and programs"),
            msg("api", "db", "1.2 Load active survey"),
            ret("api", "web", "1.3 Show verification form"),
            sec("Verify Graduate Identity"),
            msg("grad", "web", "2. Enter registrar details"),
            msg("web", "api", "2.1 POST /surveys/verify.php"),
            msg("api", "db", "2.2 Match graduate record"),
            msg("api", "db", "2.3 Check duplicate response"),
            msg("api", "db", "2.4 Create or reuse token"),
            ret("api", "web", "2.5 Return token/profile"),
            ret("web", "grad", "2.6 Continue to survey"),
        ],
    ),
    page(
        "Survey Form Loading Flow",
        [
            ("grad", "Graduate", 80, 130),
            ("web", "Survey Page", 270, 135),
            ("api", "Survey API", 460, 130),
            ("psgc", "PSGC API", 650, 130),
            ("db", "MySQL Database", 840, 145),
            ("mail", "Email Service", 1025, 130),
        ],
        [
            sec("Load Survey Form"),
            msg("grad", "web", "1. Open /survey with token"),
            msg("web", "api", "1.1 GET validate-token"),
            msg("api", "db", "1.2 Verify token and survey"),
            msg("web", "api", "1.3 GET survey detail"),
            ret("api", "web", "1.4 Return questions/profile"),
            sec("PSGC Address Selection"),
            msg("grad", "web", "2. Select address"),
            msg("web", "psgc", "2.1 Load PSGC options"),
            ret("psgc", "web", "2.2 Return address choices"),
        ],
    ),
    page(
        "Survey Response Saving Flow",
        [
            ("grad", "Graduate", 80, 130),
            ("web", "Survey Page", 270, 135),
            ("api", "Survey API", 460, 130),
            ("psgc", "PSGC API", 650, 130),
            ("db", "MySQL Database", 840, 145),
            ("mail", "Email Service", 1025, 130),
        ],
        [
            sec("Submit Response"),
            msg("grad", "web", "1. Submit answers"),
            msg("web", "api", "1.1 POST survey response"),
            msg("api", "db", "1.2 Check token/duplicates"),
            msg("api", "psgc", "1.3 Validate PSGC codes"),
            msg("api", "db", "1.4 Save response/token"),
            msg("api", "mail", "1.5 Send confirmation email"),
            ret("api", "web", "1.6 Return completion"),
            ret("web", "grad", "1.7 Show success message"),
        ],
    ),
    page(
        "Graduate Account Request Flow",
        [
            ("grad", "Graduate", 100, 140),
            ("web", "Survey Page", 365, 140),
            ("auth", "Graduate Auth API", 630, 170),
            ("db", "MySQL Database", 895, 150),
        ],
        [
            sec("Create Portal Account"),
            msg("grad", "web", "1. Choose create account"),
            msg("web", "auth", "1.1 POST register-from-survey"),
            msg("auth", "db", "1.2 Verify survey response"),
            msg("auth", "db", "1.3 Check duplicate account"),
            msg("auth", "db", "1.4 Create pending account"),
            msg("auth", "db", "1.5 Link alumni registry"),
            ret("auth", "web", "1.6 Return pending status"),
            sec("Graduate Login Gate"),
            msg("grad", "web", "2. Try graduate sign-in"),
            msg("web", "auth", "2.1 POST graduate login"),
            msg("auth", "db", "2.2 Require active approval"),
            ret("auth", "web", "2.3 Return allowed/blocked"),
            ret("web", "grad", "2.4 Show portal or notice"),
        ],
    ),
    page(
        "Graduate Portal Profile Flow",
        [
            ("grad", "Graduate / Alumni", 70, 145),
            ("web", "Graduate Portal", 230, 145),
            ("auth", "Graduate Auth API", 385, 145),
            ("api", "Profile APIs", 540, 135),
            ("db", "MySQL Database", 740, 140),
            ("store", "Local Uploads", 960, 130),
        ],
        [
            sec("Portal Data Load"),
            msg("grad", "web", "1. Open Graduate Portal"),
            msg("web", "auth", "1.1 GET auth check"),
            ret("auth", "web", "1.2 Return graduate session"),
            msg("web", "api", "1.3 GET profile/rating/activity"),
            msg("api", "db", "1.4 Query portal data"),
            ret("api", "web", "1.5 Return portal widgets"),
            sec("Profile Update"),
            msg("grad", "web", "2. Update profile/photo"),
            msg("web", "api", "2.1 POST profile FormData"),
            msg("api", "store", "2.2 Save image locally"),
            msg("api", "db", "2.3 Update profile records"),
            ret("api", "web", "2.4 Return updated profile"),
        ],
    ),
    page(
        "Notification Bell Flow",
        [
            ("user", "Admin / Graduate", 100, 150),
            ("web", "GradTrack Web App", 365, 160),
            ("api", "Notification API", 630, 160),
            ("db", "MySQL Database", 895, 150),
        ],
        [
            sec("Notifications"),
            msg("user", "web", "1. Open authenticated page"),
            msg("web", "api", "1.1 GET notifications"),
            msg("api", "db", "1.2 Build role feed"),
            msg("api", "db", "1.3 Load read markers"),
            ret("api", "web", "1.4 Return notifications"),
            ret("web", "user", "1.5 Show notification bell"),
            msg("user", "web", "2. Mark item read"),
            msg("web", "api", "2.1 POST mark_read"),
            msg("api", "db", "2.2 Save read marker"),
            ret("api", "web", "2.3 Return updated state"),
        ],
    ),
    page(
        "Community Forum Posting Flow",
        [
            ("grad", "Graduate / Alumni", 80, 145),
            ("web", "Graduate Portal", 270, 145),
            ("api", "Forum API", 460, 130),
            ("groq", "Groq AI", 650, 120),
            ("store", "Local Uploads", 840, 135),
            ("db", "MySQL Database", 1025, 140),
        ],
        [
            sec("Load Forum Feed"),
            msg("grad", "web", "1. Open community tab"),
            msg("web", "api", "1.1 GET forum feed"),
            msg("api", "db", "1.2 Query approved posts"),
            ret("api", "web", "1.3 Return feed"),
            sec("Create Forum Post"),
            msg("grad", "web", "2. Compose post"),
            msg("web", "api", "2.1 POST AI moderation"),
            msg("api", "groq", "2.2 Run Groq/keyword check"),
            ret("api", "web", "2.3 Return moderation result"),
            msg("web", "api", "2.4 POST forum post"),
            msg("api", "store", "2.5 Save media locally"),
            msg("api", "db", "2.6 Insert/update post"),
            ret("api", "web", "2.7 Return post status"),
        ],
    ),
    page(
        "Community Forum Engagement Flow",
        [
            ("grad", "Graduate / Alumni", 100, 150),
            ("web", "Graduate Portal", 365, 145),
            ("api", "Forum API", 630, 130),
            ("db", "MySQL Database", 895, 150),
        ],
        [
            sec("Forum Engagement"),
            msg("grad", "web", "1. Open post details"),
            msg("web", "api", "1.1 GET comments"),
            msg("api", "db", "1.2 Query comments/replies"),
            ret("api", "web", "1.3 Display discussion"),
            msg("grad", "web", "2. Add comment or reply"),
            msg("web", "api", "2.1 POST comment"),
            msg("api", "db", "2.2 Save comment row"),
            ret("api", "web", "2.3 Refresh discussion"),
            msg("grad", "web", "3. Like or report content"),
            msg("web", "api", "3.1 POST like/report"),
            msg("api", "db", "3.2 Update forum tables"),
            ret("api", "web", "3.3 Refresh metrics"),
        ],
    ),
    page(
        "Graduate Job Posting Flow",
        [
            ("grad", "Graduate / Alumni", 100, 150),
            ("web", "Graduate Portal", 315, 145),
            ("api", "Jobs API", 550, 125),
            ("store", "Local Uploads", 785, 130),
            ("db", "MySQL Database", 1020, 145),
        ],
        [
            sec("Browse Approved Jobs"),
            msg("grad", "web", "1. Open jobs tab"),
            msg("web", "api", "1.1 GET approved jobs"),
            msg("api", "db", "1.2 Query approved job_posts"),
            ret("api", "web", "1.3 Return job listings"),
            sec("Submit Job Post"),
            msg("grad", "web", "2. Submit job post"),
            msg("web", "api", "2.1 POST job FormData"),
            msg("api", "store", "2.2 Save requirements file"),
            msg("api", "db", "2.3 Insert pending job_post"),
            ret("api", "web", "2.4 Return pending status"),
            sec("Maintain Own Job Post"),
            msg("grad", "web", "3. Edit or remove own post"),
            msg("web", "api", "3.1 PUT/DELETE job post"),
            msg("api", "db", "3.2 Update job_post"),
            ret("api", "web", "3.3 Return updated list"),
        ],
    ),
    page(
        "Job Approval Flow",
        [
            ("aa", "Alumni Admin", 100, 135),
            ("web", "Job Approval UI", 315, 145),
            ("api", "Approval API", 550, 130),
            ("db", "MySQL Database", 785, 145),
            ("mail", "Email Service", 1020, 130),
        ],
        [
            sec("Approve or Decline"),
            msg("aa", "web", "1. Open job approvals"),
            msg("web", "api", "1.1 GET approval queue"),
            msg("api", "db", "1.2 Verify alumni_admin"),
            msg("api", "db", "1.3 Query pending jobs"),
            ret("api", "web", "1.4 Display queue"),
            msg("aa", "web", "2. Approve or decline job"),
            msg("web", "api", "2.1 PUT approval status"),
            msg("api", "db", "2.2 Update job/audit"),
            msg("api", "mail", "2.3 Email poster if approved"),
            ret("api", "web", "2.4 Return decision"),
        ],
    ),
    page(
        "Chat Setup and Attachment Flow",
        [
            ("sender", "Graduate / Alumni", 80, 145),
            ("web", "Graduate Portal", 300, 140),
            ("php", "PHP Chat API", 520, 130),
            ("store", "Local Uploads", 740, 130),
            ("db", "MySQL Database", 960, 140),
        ],
        [
            sec("Load Conversations"),
            msg("sender", "web", "1. Open chat workspace"),
            msg("web", "php", "1.1 GET rooms/messages"),
            msg("php", "db", "1.2 Query chat tables"),
            ret("php", "web", "1.3 Return rooms/messages"),
            msg("sender", "web", "2. Create or open room"),
            msg("web", "php", "2.1 POST room request"),
            msg("php", "db", "2.2 Create/find members"),
            ret("php", "web", "2.3 Return room data"),
            sec("Attachment Upload"),
            msg("sender", "web", "3. Attach file"),
            msg("web", "php", "3.1 POST chat attachment"),
            msg("php", "store", "3.2 Save attachment file"),
            msg("php", "db", "3.3 Create attachment row"),
            ret("php", "web", "3.4 Return attachment id"),
        ],
    ),
    page(
        "Realtime Message Delivery Flow",
        [
            ("sender", "Graduate A", 80, 125),
            ("web", "Graduate Portal", 280, 140),
            ("socket", "Socket.IO Server", 480, 145),
            ("php", "Graduate Auth API", 680, 145),
            ("db", "MySQL Database", 880, 140),
            ("receiver", "Graduate B", 1035, 120),
        ],
        [
            sec("Realtime Message"),
            msg("web", "socket", "1. Connect with session"),
            msg("socket", "php", "1.1 Verify graduate auth"),
            ret("php", "socket", "1.2 Return graduate user"),
            msg("sender", "web", "2. Send chat message"),
            msg("web", "socket", "2.1 Emit message:send"),
            msg("socket", "db", "2.2 Insert message row"),
            msg("socket", "receiver", "2.3 Broadcast new message"),
            ret("socket", "web", "2.4 Acknowledge delivery"),
            sec("Read and Presence Events"),
            msg("receiver", "socket", "3. Send read/typing event"),
            msg("socket", "db", "3.1 Update read state"),
            msg("socket", "sender", "3.2 Broadcast status update"),
        ],
    ),
    page(
        "Registrar Graduate Records Flow",
        [
            ("reg", "Registrar", 80, 130),
            ("web", "Graduates Page", 300, 150),
            ("api", "Graduates API", 520, 145),
            ("db", "MySQL Database", 740, 145),
            ("audit", "Audit Trail", 960, 125),
        ],
        [
            sec("View Records"),
            msg("reg", "web", "1. Open graduate records"),
            msg("web", "api", "1.1 GET graduates"),
            msg("api", "db", "1.2 Verify registrar role"),
            msg("api", "db", "1.3 Query graduates/employment"),
            ret("api", "web", "1.4 Display records"),
            sec("Maintain Record"),
            msg("reg", "web", "2. Add, edit, or delete"),
            msg("web", "api", "2.1 Send record request"),
            msg("api", "db", "2.2 Write graduate/employment"),
            msg("api", "audit", "2.3 Log registrar action"),
            ret("api", "web", "2.4 Return saved result"),
            sec("Excel Import"),
            msg("reg", "web", "3. Upload spreadsheet"),
            msg("web", "api", "3.1 POST mapped rows"),
            msg("api", "db", "3.2 Insert/update records"),
            ret("api", "web", "3.3 Show import result"),
        ],
    ),
    page(
        "Admin Survey Management Flow",
        [
            ("admin", "Admin", 80, 120),
            ("web", "Survey Admin UI", 300, 155),
            ("api", "Survey API", 520, 130),
            ("db", "MySQL Database", 740, 145),
            ("audit", "Audit Trail", 960, 125),
        ],
        [
            sec("Survey List"),
            msg("admin", "web", "1. Open survey manager"),
            msg("web", "api", "1.1 GET surveys"),
            msg("api", "db", "1.2 Load surveys/questions"),
            ret("api", "web", "1.3 Display survey list"),
            sec("Create or Edit Survey"),
            msg("admin", "web", "2. Save survey design"),
            msg("web", "api", "2.1 POST/PUT survey"),
            msg("api", "db", "2.2 Save survey/questions"),
            msg("api", "audit", "2.3 Log survey action"),
            ret("api", "web", "2.4 Return saved survey"),
            sec("Activate or Remove"),
            msg("admin", "web", "3. Activate/delete/clear"),
            msg("web", "api", "3.1 Send update request"),
            msg("api", "db", "3.2 Enforce active survey rule"),
            ret("api", "web", "3.3 Return status"),
        ],
    ),
    page(
        "Admin Dean Survey Monitoring Flow",
        [
            ("role", "Admin / Dean", 80, 140),
            ("web", "Status UI", 315, 130),
            ("api", "Status API", 550, 130),
            ("db", "MySQL Database", 785, 145),
            ("scope", "Program Scope", 1020, 140),
        ],
        [
            sec("Survey Participation"),
            msg("role", "web", "1. Open survey status"),
            msg("web", "api", "1.1 GET status endpoint"),
            msg("api", "scope", "1.2 Apply role/program scope"),
            msg("api", "db", "1.3 Query response counts"),
            ret("api", "web", "1.4 Return counts/list"),
            sec("Response Review"),
            msg("role", "web", "2. View survey responses"),
            msg("web", "api", "2.1 GET responses"),
            msg("api", "scope", "2.2 Apply dean scope"),
            msg("api", "db", "2.3 Query scoped answers"),
            ret("api", "web", "2.4 Display response table"),
        ],
    ),
    page(
        "Admin Dean Reminder Flow",
        [
            ("role", "Admin / Dean", 100, 140),
            ("web", "Status UI", 300, 130),
            ("notify", "Reminder API", 500, 135),
            ("db", "MySQL Database", 700, 145),
            ("mail", "Email Service", 900, 130),
        ],
        [
            sec("Manual Reminders"),
            msg("role", "web", "1. Select recipients"),
            msg("web", "notify", "1.1 POST reminders"),
            msg("notify", "db", "1.2 Verify role/scope"),
            msg("notify", "db", "1.3 Select nonrespondents"),
            msg("notify", "mail", "1.4 Send reminder emails"),
            ret("mail", "notify", "1.5 Return sent status"),
            msg("notify", "db", "1.6 Log reminder results"),
            ret("notify", "web", "1.7 Return sent count"),
        ],
    ),
    page(
        "Reports Analytics Flow",
        [
            ("role", "Admin / Dean", 100, 135),
            ("web", "Reports UI", 365, 130),
            ("reports", "Reports API", 630, 130),
            ("db", "MySQL Database", 895, 140),
        ],
        [
            sec("Reports and Analytics"),
            msg("role", "web", "1. Open reports"),
            msg("web", "reports", "1.1 GET report data"),
            msg("reports", "db", "1.2 Aggregate scoped data"),
            ret("reports", "web", "1.3 Return report tables"),
            msg("web", "reports", "1.4 GET survey analytics"),
            msg("reports", "db", "1.5 Compute chart data"),
            ret("reports", "web", "1.6 Return analytics"),
            ret("web", "role", "1.7 Display reports dashboard"),
        ],
    ),
    page(
        "Reports GenAI and Export Flow",
        [
            ("role", "Admin / Dean", 70, 135),
            ("web", "Reports UI", 230, 130),
            ("reports", "Reports API", 385, 130),
            ("db", "MySQL Database", 540, 140),
            ("ai", "Groq AI API", 695, 130),
            ("chart", "QuickChart", 850, 130),
            ("file", "Export File", 1010, 125),
        ],
        [
            sec("GenAI Insight"),
            msg("role", "web", "1. Ask AI assistant"),
            msg("web", "reports", "1.1 POST GenAI request"),
            msg("reports", "db", "1.2 Load authorized data"),
            msg("reports", "ai", "1.3 Call Groq if configured"),
            ret("reports", "web", "1.4 Return insight"),
            sec("Export"),
            msg("role", "web", "2. Export report"),
            msg("web", "chart", "2.1 Fetch chart images"),
            msg("web", "file", "2.2 Generate PDF/XLSX/CSV"),
            ret("file", "role", "2.3 Download export"),
        ],
    ),
    page(
        "Alumni Registry Import Flow",
        [
            ("aa", "Alumni Admin", 80, 135),
            ("web", "Alumni Registry UI", 300, 160),
            ("api", "Alumni Registry API", 520, 165),
            ("db", "MySQL Database", 740, 145),
            ("audit", "Audit Trail", 960, 125),
        ],
        [
            sec("Registry Workspace"),
            msg("aa", "web", "1. Open alumni registry"),
            msg("web", "api", "1.1 GET summary/list"),
            msg("api", "db", "1.2 Verify alumni_admin"),
            msg("api", "db", "1.3 Query alumni/accounts"),
            ret("api", "web", "1.4 Display review queue"),
            sec("Official List Import"),
            msg("aa", "web", "2. Upload official list"),
            msg("web", "api", "2.1 POST preview/import"),
            msg("api", "db", "2.2 Validate duplicates"),
            msg("api", "db", "2.3 Save registry rows"),
            msg("api", "audit", "2.4 Log import action"),
            ret("api", "web", "2.5 Show import summary"),
        ],
    ),
    page(
        "Alumni Account Verification Flow",
        [
            ("aa", "Alumni Admin", 80, 135),
            ("web", "Alumni Registry UI", 300, 160),
            ("api", "Alumni Registry API", 520, 165),
            ("db", "MySQL Database", 740, 145),
            ("audit", "Audit Trail", 960, 125),
        ],
        [
            sec("Pending Account Queue"),
            msg("aa", "web", "1. Open pending accounts"),
            msg("web", "api", "1.1 GET pending_accounts"),
            msg("api", "db", "1.2 Verify alumni_admin"),
            msg("api", "db", "1.3 Query graduate_accounts"),
            ret("api", "web", "1.4 Display pending list"),
            sec("Account Decision"),
            msg("aa", "web", "2. Approve or reject account"),
            msg("web", "api", "2.1 PUT account decision"),
            msg("api", "db", "2.2 Update account/link"),
            msg("api", "audit", "2.3 Log verification"),
            ret("api", "web", "2.4 Return decision result"),
            sec("Manual Registry Update"),
            msg("aa", "web", "3. Link/verify/inactivate"),
            msg("web", "api", "3.1 PUT registry action"),
            msg("api", "db", "3.2 Update registry row"),
            ret("api", "web", "3.3 Refresh registry"),
        ],
    ),
    page(
        "Alumni Admin Moderation Flow",
        [
            ("aa", "Alumni Admin", 80, 135),
            ("web", "Admin Web App", 300, 140),
            ("forum", "Forum Moderation API", 520, 170),
            ("jobs", "Job Approval API", 740, 150),
            ("db", "MySQL Database", 960, 145),
        ],
        [
            sec("Forum Moderation"),
            msg("aa", "web", "1. Open forum moderation"),
            msg("web", "forum", "1.1 GET moderation queue"),
            msg("forum", "db", "1.2 Query posts/reports"),
            ret("forum", "web", "1.3 Display queue"),
            msg("aa", "web", "2. Decide content status"),
            msg("web", "forum", "2.1 PUT/DELETE content"),
            msg("forum", "db", "2.2 Update forum records"),
            ret("forum", "web", "2.3 Return moderation result"),
            sec("Job Moderation"),
            msg("aa", "web", "3. Open job approvals"),
            msg("web", "jobs", "3.1 GET pending jobs"),
            msg("jobs", "db", "3.2 Query job_posts"),
            ret("jobs", "web", "3.3 Display jobs"),
            msg("aa", "web", "4. Approve or decline job"),
            msg("web", "jobs", "4.1 PUT approval status"),
            msg("jobs", "db", "4.2 Update job/audit"),
        ],
    ),
    page(
        "Super Admin User Management Flow",
        [
            ("sa", "Super Admin", 80, 135),
            ("web", "User Management UI", 315, 160),
            ("users", "Users API", 550, 125),
            ("db", "MySQL Database", 785, 140),
            ("audit", "Audit Trail", 1020, 125),
        ],
        [
            sec("User Management"),
            msg("sa", "web", "1. Open user management"),
            msg("web", "users", "1.1 GET users"),
            msg("users", "db", "1.2 Verify super_admin"),
            msg("users", "db", "1.3 Query admin_users"),
            ret("users", "web", "1.4 Display accounts"),
            msg("sa", "web", "2. Maintain admin account"),
            msg("web", "users", "2.1 POST/PUT/DELETE user"),
            msg("users", "db", "2.2 Save admin_users row"),
            msg("users", "audit", "2.3 Log user action"),
            ret("users", "web", "2.4 Return result"),
        ],
    ),
    page(
        "Super Admin Settings Flow",
        [
            ("sa", "Super Admin", 100, 135),
            ("web", "Settings UI", 300, 130),
            ("settings", "Settings API", 500, 130),
            ("store", "Local Uploads", 700, 130),
            ("db", "MySQL Database", 900, 140),
        ],
        [
            sec("System Settings"),
            msg("sa", "web", "1. Open settings"),
            msg("web", "settings", "1.1 GET settings"),
            msg("settings", "db", "1.2 Verify super_admin"),
            msg("settings", "db", "1.3 Load system_settings"),
            ret("settings", "web", "1.4 Display settings"),
            msg("sa", "web", "2. Upload branding"),
            msg("web", "settings", "2.1 POST upload"),
            msg("settings", "store", "2.2 Save branding image"),
            msg("settings", "db", "2.3 Save setting/audit"),
            ret("settings", "web", "2.4 Return image path"),
            msg("sa", "web", "3. Save settings"),
            msg("web", "settings", "3.1 PUT settings"),
            msg("settings", "db", "3.2 Upsert settings/audit"),
            ret("settings", "web", "3.3 Return saved state"),
        ],
    ),
    page(
        "Super Admin Backup Flow",
        [
            ("sa", "Super Admin", 100, 135),
            ("web", "Backup UI", 365, 130),
            ("backup", "Backup API", 630, 125),
            ("db", "MySQL Database", 895, 140),
        ],
        [
            sec("Database Backup"),
            msg("sa", "web", "1. Open backup page"),
            msg("web", "backup", "1.1 GET backup summary"),
            msg("backup", "db", "1.2 Count tables/rows"),
            ret("backup", "web", "1.3 Display summary"),
            msg("sa", "web", "2. Download SQL backup"),
            msg("web", "backup", "2.1 GET backup download"),
            msg("backup", "db", "2.2 Read table structures"),
            msg("backup", "db", "2.3 Stream INSERT data"),
            ret("backup", "web", "2.4 Download .sql file"),
        ],
    ),
    page(
        "Super Admin Auto Reminder Flow",
        [
            ("sa", "Super Admin", 100, 135),
            ("web", "Auto Reminder UI", 300, 150),
            ("api", "Auto Reminder API", 500, 155),
            ("db", "MySQL Database", 700, 140),
            ("mail", "Email Service", 900, 130),
        ],
        [
            sec("Auto Reminder Dashboard"),
            msg("sa", "web", "1. Open reminders"),
            msg("web", "api", "1.1 GET status/logs"),
            msg("api", "db", "1.2 Load survey/settings"),
            msg("api", "db", "1.3 Find eligible graduates"),
            ret("api", "web", "1.4 Display dashboard"),
            sec("Send or Configure"),
            msg("sa", "web", "2. Send/update reminders"),
            msg("web", "api", "2.1 POST reminder action"),
            msg("api", "db", "2.2 Select recipients/settings"),
            msg("api", "mail", "2.3 Send reminder emails"),
            msg("api", "db", "2.4 Log results/settings"),
            ret("api", "web", "2.5 Return counts/status"),
        ],
    ),
    page(
        "Super Admin Audit Trail Flow",
        [
            ("sa", "Super Admin", 100, 135),
            ("web", "Audit Trail UI", 365, 140),
            ("api", "Audit API", 630, 125),
            ("db", "MySQL Database", 895, 140),
        ],
        [
            sec("Audit Review"),
            msg("sa", "web", "1. Open audit trail"),
            msg("web", "api", "1.1 GET audit records"),
            msg("api", "db", "1.2 Verify super_admin"),
            msg("api", "db", "1.3 Query audit_trail"),
            ret("api", "web", "1.4 Display logs"),
            sec("CSV Export"),
            msg("sa", "web", "2. Export audit CSV"),
            msg("web", "api", "2.1 GET export=csv"),
            msg("api", "db", "2.2 Query filtered logs"),
            msg("api", "db", "2.3 Log export action"),
            ret("api", "web", "2.4 Download CSV"),
        ],
    ),
]


def build_drawio(pages: Iterable[dict]) -> str:
    diagrams = []
    for index, data in enumerate(pages, start=1):
        builder = DiagramBuilder(data["name"], data["participants"], data["items"])
        diagrams.append(builder.build(f"gradtrack-sequence-revised-{index}"))

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
