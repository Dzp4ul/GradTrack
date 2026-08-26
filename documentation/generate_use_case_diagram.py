from __future__ import annotations

import html
import math
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DOCX_PATH = ROOT / "GradTrack_Use_Case_Diagram.docx"
DRAWIO_PATH = ROOT / "GradTrack_Use_Case_Diagram.drawio"

CANVAS_W = 1100
CANVAS_H = 850
BOUNDARY = {"x": 120, "y": 45, "w": 855, "h": 790}


@dataclass(frozen=True)
class Actor:
    id: str
    label: str
    x: float
    y: float
    w: float = 72
    h: float = 112
    side: str = "left"


@dataclass(frozen=True)
class UseCase:
    id: str
    label: str
    x: float
    y: float
    w: float = 238
    h: float = 58

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def right(self) -> float:
        return self.x + self.w

    @property
    def bottom(self) -> float:
        return self.y + self.h


actors = [
    Actor("actor_super_admin", "Super Admin", 24, 88),
    Actor("actor_admin", "Admin", 24, 292),
    Actor("actor_registrar", "Registrar", 24, 548),
    Actor("actor_alumni_admin", "Alumni Admin", 24, 704),
    Actor("actor_graduate", "Graduate / Alumni", 1002, 315, w=78, h=120, side="right"),
]

use_cases = [
    # Super Admin
    UseCase("uc_sa_accounts_roles", "Manage Administrator Accounts and Roles", 160, 65, 300, 62),
    UseCase("uc_sa_settings", "Configure System Settings", 195, 135, 250, 58),
    UseCase("uc_sa_audit", "View Activity and Audit Logs", 160, 205, 230, 58),

    # Admin
    UseCase("uc_admin_survey", "Manage Graduate Tracer Survey", 340, 255, 280, 60),
    UseCase("uc_admin_participation", "Monitor Survey Participation and Responses", 340, 330, 300, 64),
    UseCase("uc_admin_reports", "View Reports, Analytics and AI Explanations", 340, 410, 300, 68),
    UseCase("uc_admin_export", "Generate and Export Reports", 340, 490, 270, 60),

    # Registrar
    UseCase("uc_reg_records", "Manage Official Graduate Records", 160, 545, 290, 60),
    UseCase("uc_reg_review_import", "Review, Search and Import Graduate Information", 190, 612, 320, 64),

    # Alumni Admin
    UseCase("uc_alumni_registry", "Manage Alumni Registry and Verification", 160, 690, 315, 58),
    UseCase("uc_alumni_moderation", "Moderate Forum and Job Post Approvals", 160, 755, 320, 60),

    # Graduate / Alumni
    UseCase("uc_grad_survey_register", "Verify Identity, Complete Survey and Register", 660, 70, 290, 66),
    UseCase("uc_grad_login", "Login and Access Graduate Portal", 700, 150, 250, 60),
    UseCase("uc_grad_profile", "Manage Profile and Career Information", 660, 250, 290, 64),
    UseCase("uc_grad_jobs", "Use Alumni Job Support", 700, 325, 250, 60),
    UseCase("uc_grad_community", "Participate in Community Forum and Messaging", 660, 405, 290, 66),
    UseCase("uc_grad_notifications", "Receive System and Job Notifications", 700, 530, 250, 60),
]

use_case_by_id = {uc.id: uc for uc in use_cases}
actor_by_id = {actor.id: actor for actor in actors}

associations = [
    ("actor_super_admin", "uc_sa_accounts_roles"),
    ("actor_super_admin", "uc_sa_settings"),
    ("actor_super_admin", "uc_sa_audit"),
    ("actor_admin", "uc_admin_survey"),
    ("actor_admin", "uc_admin_participation"),
    ("actor_admin", "uc_admin_reports"),
    ("actor_admin", "uc_admin_export"),
    ("actor_registrar", "uc_reg_records"),
    ("actor_registrar", "uc_reg_review_import"),
    ("actor_alumni_admin", "uc_alumni_registry"),
    ("actor_alumni_admin", "uc_alumni_moderation"),
    ("actor_graduate", "uc_grad_survey_register"),
    ("actor_graduate", "uc_grad_login"),
    ("actor_graduate", "uc_grad_profile"),
    ("actor_graduate", "uc_grad_jobs"),
    ("actor_graduate", "uc_grad_community"),
    ("actor_graduate", "uc_grad_notifications"),
]

relations: list[dict[str, object]] = []


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def actor_anchor(actor: Actor, target_y: float) -> tuple[float, float]:
    if actor.side == "left":
        x = actor.x + actor.w * 0.72
    else:
        x = actor.x + actor.w * 0.28
    y = max(actor.y + 34, min(target_y, actor.y + actor.h - 36))
    return x, y


def ellipse_anchor_from_point(uc: UseCase, point: tuple[float, float]) -> tuple[float, float]:
    px, py = point
    dx = px - uc.cx
    dy = py - uc.cy
    rx = uc.w / 2
    ry = uc.h / 2
    if dx == 0 and dy == 0:
        return uc.x, uc.cy
    scale = 1 / math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
    return uc.cx + dx * scale, uc.cy + dy * scale


def association_line(actor: Actor, uc: UseCase) -> tuple[tuple[float, float], tuple[float, float]]:
    start = actor_anchor(actor, uc.cy)
    end = ellipse_anchor_from_point(uc, start)
    return start, end


def drawio_vertex(cell_id: str, value: str, style: str, x: float, y: float, w: float, h: float) -> str:
    return (
        f'<mxCell id="{cell_id}" value="{esc(value)}" style="{style}" vertex="1" parent="1">'
        f'<mxGeometry x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" as="geometry" />'
        "</mxCell>"
    )


def drawio_text(cell_id: str, value: str, x: float, y: float, w: float, h: float, font_size: int, bold: bool = False) -> str:
    style = (
        "text;html=1;strokeColor=none;fillColor=#ffffff;align=center;verticalAlign=middle;"
        f"fontFamily=Arial;fontSize={font_size};fontColor=#000000;"
    )
    if bold:
        style += "fontStyle=1;"
    return drawio_vertex(cell_id, value, style, x, y, w, h)


def drawio_edge(cell_id: str, source: str, target: str, dashed: bool = False) -> str:
    style = "endArrow=none;html=1;rounded=0;edgeStyle=none;strokeColor=#000000;strokeWidth=1.2;"
    if dashed:
        style = "endArrow=open;endFill=0;html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;dashed=1;strokeColor=#000000;strokeWidth=1.1;"
    return (
        f'<mxCell id="{cell_id}" value="" style="{style}" edge="1" parent="1" source="{source}" target="{target}">'
        '<mxGeometry relative="1" as="geometry" />'
        "</mxCell>"
    )


def drawio_relation(rel: dict[str, object]) -> str:
    points = rel["points"]
    waypoint_xml = "".join(f'<mxPoint x="{x:.1f}" y="{y:.1f}" />' for x, y in points[1:-1])
    style = "endArrow=open;endFill=0;html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;dashed=1;strokeColor=#000000;strokeWidth=1.1;"
    return (
        f'<mxCell id="{rel["id"]}" value="" style="{style}" edge="1" parent="1" source="{rel["source"]}" target="{rel["target"]}">'
        '<mxGeometry relative="1" as="geometry">'
        f'<Array as="points">{waypoint_xml}</Array>'
        "</mxGeometry></mxCell>"
    )


def build_drawio() -> str:
    cells = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />']
    cells.append(
        drawio_vertex(
            "system_boundary",
            "",
            "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#000000;strokeWidth=2;container=1;collapsible=0;",
            BOUNDARY["x"], BOUNDARY["y"], BOUNDARY["w"], BOUNDARY["h"],
        )
    )
    cells.append(drawio_text("system_title", "GradTrack Responsive Web System", 330, 62, 430, 34, 18, True))
    cells.append(drawio_text("system_subtitle", "Graduate Tracer and Alumni Job Support System", 335, 95, 420, 24, 13, False))

    for actor in actors:
        cells.append(
            drawio_vertex(
                actor.id,
                actor.label,
                "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;"
                "fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.3;fontFamily=Arial;"
                "fontSize=13;fontStyle=1;fontColor=#000000;",
                actor.x, actor.y, actor.w, actor.h,
            )
        )

    for uc in use_cases:
        cells.append(
            drawio_vertex(
                uc.id,
                uc.label,
                "ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.2;"
                "fontFamily=Arial;fontSize=12;fontColor=#000000;align=center;verticalAlign=middle;spacing=8;",
                uc.x, uc.y, uc.w, uc.h,
            )
        )

    for index, (actor_id, uc_id) in enumerate(associations, 1):
        cells.append(drawio_edge(f"assoc_{index:02d}", actor_id, uc_id))

    for rel in relations:
        cells.append(drawio_relation(rel))
        lx, ly, lw, lh = rel["label_pos"]
        cells.append(drawio_text(f'{rel["id"]}_label', rel["label"], lx, ly, lw, lh, 10, False))

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-08-26T00:00:00.000Z" agent="Codex" version="24.7.17" type="device">
  <diagram id="GradTrackUseCaseDiagram" name="GradTrack Use Case Diagram">
    <mxGraphModel dx="{CANVAS_W}" dy="{CANVAS_H}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{CANVAS_W}" pageHeight="{CANVAS_H}" math="0" shadow="0">
      <root>
{"".join(cells)}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
'''


def wp_text(text: str, size_half_points: int, bold: bool = False) -> str:
    bold_xml = "<w:b/>" if bold else ""
    return (
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>'
        '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>'
        f'{bold_xml}<w:sz w:val="{size_half_points}"/></w:rPr>'
        f'<w:t>{esc(text)}</w:t></w:r></w:p>'
    )


def vml_textbox(text: str, size_half_points: int, bold: bool = False) -> str:
    return (
        '<v:textbox inset="4pt,2pt,4pt,2pt" style="mso-fit-shape-to-text:false">'
        '<w:txbxContent>'
        f'{wp_text(text, size_half_points, bold)}'
        '</w:txbxContent>'
        '</v:textbox>'
    )


def vml_label(shape_id: str, x: float, y: float, w: float, h: float, text: str, size_half_points: int, bold: bool = False) -> str:
    return (
        f'<v:rect id="{shape_id}" style="position:absolute;left:{x:.1f};top:{y:.1f};width:{w:.1f};height:{h:.1f};" '
        'filled="true" fillcolor="white" stroked="false">'
        f'{vml_textbox(text, size_half_points, bold)}</v:rect>'
    )


def vml_oval(uc: UseCase) -> str:
    return (
        f'<v:oval id="{uc.id}" style="position:absolute;left:{uc.x:.1f};top:{uc.y:.1f};width:{uc.w:.1f};height:{uc.h:.1f};" '
        'fillcolor="white" strokecolor="black" strokeweight="1pt">'
        f'{vml_textbox(uc.label, 23)}</v:oval>'
    )


def vml_line(shape_id: str, p1: tuple[float, float], p2: tuple[float, float], dashed: bool = False, arrow: bool = False) -> str:
    stroke = ""
    if dashed or arrow:
        dash = ' dashstyle="dash"' if dashed else ""
        endarrow = ' endarrow="open"' if arrow else ""
        stroke = f"<v:stroke{dash}{endarrow}/>"
    return (
        f'<v:line id="{shape_id}" from="{p1[0]:.1f},{p1[1]:.1f}" to="{p2[0]:.1f},{p2[1]:.1f}" '
        'strokecolor="black" strokeweight="1pt">'
        f'{stroke}</v:line>'
    )


def vml_polyline(shape_id: str, points: list[tuple[float, float]], dashed: bool = False, arrow: bool = False) -> str:
    point_text = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    stroke = ""
    if dashed or arrow:
        dash = ' dashstyle="dash"' if dashed else ""
        endarrow = ' endarrow="open"' if arrow else ""
        stroke = f"<v:stroke{dash}{endarrow}/>"
    return (
        f'<v:polyline id="{shape_id}" points="{point_text}" filled="false" strokecolor="black" strokeweight="1pt">'
        f'{stroke}</v:polyline>'
    )


def vml_actor(actor: Actor) -> str:
    x, y = actor.x, actor.y
    center = x + actor.w / 2
    head = 25
    head_x = center - head / 2
    head_y = y + 7
    body_top = head_y + head
    body_bottom = y + 70
    arm_y = y + 48
    pieces = [
        f'<v:oval id="{actor.id}_head" style="position:absolute;left:{head_x:.1f};top:{head_y:.1f};width:{head:.1f};height:{head:.1f};" filled="false" strokecolor="black" strokeweight="1pt" />',
        vml_line(f"{actor.id}_body", (center, body_top), (center, body_bottom)),
        vml_line(f"{actor.id}_arms", (center - 27, arm_y), (center + 27, arm_y)),
        vml_line(f"{actor.id}_left_leg", (center, body_bottom), (center - 25, y + 96)),
        vml_line(f"{actor.id}_right_leg", (center, body_bottom), (center + 25, y + 96)),
        vml_label(f"{actor.id}_label", x - 20, y + 96, actor.w + 40, 28, actor.label, 25, True),
    ]
    return "\n".join(pieces)


def build_document_xml() -> str:
    scale = 0.64
    group_w = CANVAS_W * scale
    group_h = CANVAS_H * scale
    shapes = [
        f'<v:rect id="system_boundary" style="position:absolute;left:{BOUNDARY["x"]};top:{BOUNDARY["y"]};width:{BOUNDARY["w"]};height:{BOUNDARY["h"]};" filled="false" strokecolor="black" strokeweight="1.3pt" />',
        vml_label("system_title", 330, 62, 430, 34, "GradTrack Responsive Web System", 36, True),
        vml_label("system_subtitle", 335, 95, 420, 24, "Graduate Tracer and Alumni Job Support System", 27, False),
    ]

    for index, (actor_id, uc_id) in enumerate(associations, 1):
        shapes.append(vml_line(f"assoc_{index:02d}", *association_line(actor_by_id[actor_id], use_case_by_id[uc_id])))

    for rel in relations:
        shapes.append(vml_polyline(rel["id"], rel["points"], dashed=True, arrow=True))

    for actor in actors:
        shapes.append(vml_actor(actor))

    for uc in use_cases:
        shapes.append(vml_oval(uc))

    for rel in relations:
        lx, ly, lw, lh = rel["label_pos"]
        shapes.append(vml_label(f'{rel["id"]}_label', lx, ly, lw, lh, rel["label"], 20, False))

    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:o="urn:schemas-microsoft-com:office:office">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r>
        <w:pict>
          <v:group id="GradTrackUseCaseDiagram" style="position:relative;width:{group_w:.2f}pt;height:{group_h:.2f}pt;" coordsize="{CANVAS_W},{CANVAS_H}">
            {"".join(shapes)}
          </v:group>
        </w:pict>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:before="80"/></w:pPr>
      <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr><w:t>Figure 1. GradTrack Use Case Diagram</w:t></w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="360" w:right="360" w:bottom="360" w:left="360" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
'''


def build_docx() -> None:
    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
'''
    rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'''
    tmp_path = DOCX_PATH.with_name(DOCX_PATH.name + ".tmp")
    with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types)
        docx.writestr("_rels/.rels", rels)
        docx.writestr("word/document.xml", build_document_xml())
    tmp_path.replace(DOCX_PATH)


def ccw(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> bool:
    return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0])


def segments_intersect(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], d: tuple[float, float]) -> bool:
    return ccw(a, c, d) != ccw(b, c, d) and ccw(a, b, c) != ccw(a, b, d)


def segment_intersects_rect(p1: tuple[float, float], p2: tuple[float, float], rect: tuple[float, float, float, float]) -> bool:
    x, y, w, h = rect
    corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    return any(segments_intersect(p1, p2, a, b) for a, b in zip(corners, corners[1:] + corners[:1]))


def validate_layout() -> None:
    errors: list[str] = []
    margin = 18
    bx, by, bw, bh = BOUNDARY["x"], BOUNDARY["y"], BOUNDARY["w"], BOUNDARY["h"]
    for uc in use_cases:
        if uc.x <= bx + margin or uc.y <= by + margin or uc.right >= bx + bw - margin or uc.bottom >= by + bh - margin:
            errors.append(f"{uc.id} too close to boundary")

    for index, (actor_id, uc_id) in enumerate(associations, 1):
        p1, p2 = association_line(actor_by_id[actor_id], use_case_by_id[uc_id])
        for other in use_cases:
            if other.id == uc_id:
                continue
            padded = (other.x + 8, other.y + 8, other.w - 16, other.h - 16)
            if segment_intersects_rect(p1, p2, padded):
                errors.append(f"association {index} crosses {other.id}")
                break

    if errors:
        raise RuntimeError("Layout validation failed: " + "; ".join(errors[:8]))


def validate_outputs() -> None:
    validate_layout()
    drawio_xml = DRAWIO_PATH.read_text(encoding="utf-8")
    ET.fromstring(drawio_xml)
    if "data:image" in drawio_xml or "image;" in drawio_xml:
        raise RuntimeError("Draw.io output contains an embedded image")
    with zipfile.ZipFile(DOCX_PATH, "r") as docx:
        if docx.testzip() is not None:
            raise RuntimeError("DOCX zip integrity check failed")
        names = docx.namelist()
        if any(re.search(r"\.(png|jpe?g|gif|svg|webp)$", name, re.I) for name in names):
            raise RuntimeError("DOCX output contains image media")
        document_xml = docx.read("word/document.xml")
        ET.fromstring(docx.read("[Content_Types].xml"))
        ET.fromstring(document_xml)
        if b"<v:oval" not in document_xml or b"<v:line" not in document_xml:
            raise RuntimeError("DOCX output does not contain editable drawing objects")


def main() -> None:
    DRAWIO_PATH.write_text(build_drawio(), encoding="utf-8")
    build_docx()
    validate_outputs()
    print(f"Updated {DRAWIO_PATH}")
    print(f"Updated {DOCX_PATH}")


if __name__ == "__main__":
    main()
