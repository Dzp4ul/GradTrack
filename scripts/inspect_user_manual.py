"""Extract text and render contact sheets for a PDF user manual.

This utility keeps review artifacts outside the documentation deliverables. It is
intentionally generic so the source and rendered output paths are explicit.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--per-sheet", type=int, default=6)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    pages_dir = args.output / "pages"
    sheets_dir = args.output / "contact_sheets"
    pages_dir.mkdir(exist_ok=True)
    sheets_dir.mkdir(exist_ok=True)

    document = fitz.open(args.pdf)
    metadata = {
        "source": str(args.pdf),
        "page_count": document.page_count,
        "metadata": document.metadata,
        "pages": [],
    }
    extracted_text: list[str] = []
    page_images: list[Path] = []

    for page_index, page in enumerate(document):
        text = page.get_text("text")
        extracted_text.append(f"\n===== PAGE {page_index + 1} =====\n{text}")
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
        image_path = pages_dir / f"page_{page_index + 1:03d}.png"
        pixmap.save(image_path)
        page_images.append(image_path)
        metadata["pages"].append(
            {
                "page": page_index + 1,
                "width_points": round(page.rect.width, 2),
                "height_points": round(page.rect.height, 2),
                "text_characters": len(text),
                "image_count": len(page.get_images(full=True)),
            }
        )

    (args.output / "manual_text.txt").write_text("".join(extracted_text), encoding="utf-8")
    (args.output / "manual_metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    label_font = ImageFont.load_default(size=22)
    per_sheet = max(1, args.per_sheet)
    columns = 2
    rows = (per_sheet + columns - 1) // columns
    thumb_width = 680
    label_height = 38

    for start in range(0, len(page_images), per_sheet):
        batch = page_images[start : start + per_sheet]
        opened = [Image.open(path).convert("RGB") for path in batch]
        ratios = [image.height / image.width for image in opened]
        thumb_height = int(thumb_width * max(ratios))
        sheet = Image.new(
            "RGB", (columns * thumb_width, rows * (thumb_height + label_height)), "#d9dde3"
        )
        draw = ImageDraw.Draw(sheet)
        for offset, image in enumerate(opened):
            page_number = start + offset + 1
            image.thumbnail((thumb_width - 16, thumb_height - 16), Image.Resampling.LANCZOS)
            column = offset % columns
            row = offset // columns
            x = column * thumb_width + (thumb_width - image.width) // 2
            y = row * (thumb_height + label_height) + label_height
            draw.text(
                (column * thumb_width + 12, row * (thumb_height + label_height) + 8),
                f"Page {page_number}",
                fill="black",
                font=label_font,
            )
            sheet.paste(image, (x, y))
        last_page = start + len(batch)
        sheet.save(sheets_dir / f"pages_{start + 1:03d}_{last_page:03d}.jpg", quality=88)

    print(json.dumps({"page_count": document.page_count, "output": str(args.output)}))


if __name__ == "__main__":
    main()
