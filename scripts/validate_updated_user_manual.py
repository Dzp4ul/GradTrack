from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import fitz
from docx import Document


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "documentation" / "GradTrack_User_Manual_Update"
DOCX_PATH = OUTPUT / "GradTrack_Updated_User_Manual.docx"
PDF_PATH = OUTPUT / "GradTrack_Updated_User_Manual.pdf"
CHANGE_PATH = OUTPUT / "GradTrack_Manual_Changes.md"
SCREENSHOT_ROOT = OUTPUT / "GradTrack_Updated_Screenshots"
MANIFEST_PATH = SCREENSHOT_ROOT / "screenshot_manifest.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


for required_path in (DOCX_PATH, PDF_PATH, CHANGE_PATH, SCREENSHOT_ROOT, MANIFEST_PATH):
    require(required_path.exists(), f"Missing required output: {required_path}")

manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
screenshots = manifest.get("screenshots", [])
require(len(screenshots) == 69, f"Expected 69 manifest screenshots, found {len(screenshots)}")
require(manifest.get("viewport") == "1440x900", "Unexpected screenshot viewport")
require(manifest.get("console_errors") == [], "Screenshot capture recorded console errors")

manifest_files = [SCREENSHOT_ROOT / item["file"] for item in screenshots]
missing_screenshots = [str(path) for path in manifest_files if not path.is_file()]
require(not missing_screenshots, f"Missing manifest screenshots: {missing_screenshots}")
png_files = list(SCREENSHOT_ROOT.rglob("*.png"))
require(len(png_files) == 69, f"Expected exactly 69 screenshot PNG files, found {len(png_files)}")

priority_files = (
    SCREENSHOT_ROOT / "01_Public_and_Access" / "06_alumni_membership_information.png",
    SCREENSHOT_ROOT / "01_Public_and_Access" / "07_alumni_membership_registration.png",
    SCREENSHOT_ROOT / "05_Registrar" / "01_manage_graduates.png",
    SCREENSHOT_ROOT / "05_Registrar" / "05_archive_records.png",
    SCREENSHOT_ROOT
    / "06_Alumni_President"
    / "01_alumni_verification_updated_view_details_action.png",
)
for priority_path in priority_files:
    require(priority_path.is_file(), f"Missing priority screenshot: {priority_path}")

word_document = Document(DOCX_PATH)
require(len(word_document.paragraphs) > 100, "DOCX did not open as a populated document")

pdf = fitz.open(PDF_PATH)
require(pdf.page_count == 82, f"Expected 82 PDF pages, found {pdf.page_count}")
letter_pages = 0
all_text_parts: list[str] = []
for page in pdf:
    rect = page.rect
    if abs(rect.width - 612) < 0.2 and abs(rect.height - 792) < 0.2:
        letter_pages += 1
    all_text_parts.append(page.get_text("text"))
pdf.close()
require(letter_pages == 82, f"Expected all pages to be US Letter; found {letter_pages}/82")

text = "\n".join(all_text_parts)
normalized_text = re.sub(r"\s+", " ", text)
required_phrases = (
    "Alumni Membership",
    "current interface does not provide Edit, View Details, or Restore actions",
    "updated blue eye icon",
    "MIS Staff",
)
for phrase in required_phrases:
    require(
        phrase.lower() in normalized_text.lower(),
        f"Required manual phrase not found: {phrase}",
    )

require(
    re.search(r"\b(\d+)\.\s+Step\s+\1\.", text) is None,
    "Found a redundant automatic-list number before a Step label",
)

figure_numbers = [int(value) for value in re.findall(r"\bFigure\s+(\d+)\.", text)]
figure_counts = Counter(figure_numbers)
require(set(figure_counts) == set(range(1, 70)), "Figure numbering is not sequential from 1 to 69")
require(
    all(figure_counts[number] == 2 for number in range(1, 70)),
    "Each figure should appear once in the List of Figures and once as a body caption",
)

print("Required outputs: PASS")
print("Manifest screenshots: 69 PASS")
print("Capture console errors: 0 PASS")
print("Priority screenshots: PASS")
print(f"DOCX paragraphs: {len(word_document.paragraphs)} PASS")
print("PDF pages: 82 PASS")
print("US Letter pages: 82/82 PASS")
print("Required priority wording: PASS")
print("Sequential figures: 1-69 PASS")
print("Redundant Step numbering: 0 PASS")
