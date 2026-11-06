"""Create temporary contact sheets for visual QA of documentation screenshots."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--per-sheet", type=int, default=4)
    args = parser.parse_args()

    manifest_path = args.source / "screenshot_manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        images = [args.source / item["file"] for item in manifest.get("screenshots", [])]
        images = [path for path in images if path.exists()]
    else:
        images = sorted(args.source.rglob("*.png"))
    args.output.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=18)
    per_sheet = max(1, args.per_sheet)
    columns = 2
    rows = (per_sheet + columns - 1) // columns
    cell_width, cell_height, label_height = 720, 450, 34

    for start in range(0, len(images), per_sheet):
        batch = images[start : start + per_sheet]
        sheet = Image.new(
            "RGB",
            (columns * cell_width, rows * (cell_height + label_height)),
            "#d7dce4",
        )
        draw = ImageDraw.Draw(sheet)
        for offset, path in enumerate(batch):
            image = Image.open(path).convert("RGB")
            image.thumbnail((cell_width - 16, cell_height - 16), Image.Resampling.LANCZOS)
            column, row = offset % columns, offset // columns
            x = column * cell_width + (cell_width - image.width) // 2
            y = row * (cell_height + label_height) + label_height + (cell_height - image.height) // 2
            label = str(path.relative_to(args.source)).replace("\\", "/")
            draw.text(
                (column * cell_width + 8, row * (cell_height + label_height) + 7),
                label[:92],
                fill="#111827",
                font=font,
            )
            sheet.paste(image, (x, y))
        sheet.save(args.output / f"screens_{start + 1:03d}_{start + len(batch):03d}.jpg", quality=90)

    print(f"Created {(len(images) + per_sheet - 1) // per_sheet} contact sheets for {len(images)} screenshots.")


if __name__ == "__main__":
    main()
