"""
Derives every shipped icon file from the masters rendered by make-icons.cjs.

Split from the renderer because the two halves need different tools: Chromium draws the vector,
Pillow resamples and packs the .ico container. Run make-icons.cjs first.

The .ico is written by hand rather than through Pillow's writer, because Pillow builds every
entry by resizing a single source image — and the whole point here is that 16px and 256px are
different drawings. Windows has accepted PNG-compressed entries since Vista.
"""

import os
import struct
import sys
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERS = os.path.join(os.environ.get("TEMP", "/tmp"), "nullpoint-icon-masters")
WEB = os.path.join(REPO, "apps", "web", "public")
DESKTOP = os.path.join(REPO, "apps", "desktop")

full = Image.open(os.path.join(MASTERS, "full.png")).convert("RGBA")
compact = Image.open(os.path.join(MASTERS, "compact.png")).convert("RGBA")
tray = Image.open(os.path.join(MASTERS, "tray.png")).convert("RGBA")
og = Image.open(os.path.join(MASTERS, "og.png")).convert("RGBA")

written = []


def emit(img, size, *parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    written.append(f"{os.path.relpath(path, REPO)}  {size}x{size}")


def write_ico(path, entries):
    """entries: list of (size, PIL image). Each is stored as a PNG chunk."""
    blobs = []
    for size, img in entries:
        from io import BytesIO

        buf = BytesIO()
        img.resize((size, size), Image.LANCZOS).save(buf, format="PNG", optimize=True)
        blobs.append((size, buf.getvalue()))

    offset = 6 + 16 * len(blobs)
    header = struct.pack("<HHH", 0, 1, len(blobs))
    directory = b""
    for size, blob in blobs:
        # 256 is recorded as 0 — the field is a single byte.
        directory += struct.pack(
            "<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset
        )
        offset += len(blob)
    with open(path, "wb") as fh:
        fh.write(header + directory + b"".join(blob for _, blob in blobs))
    written.append(f"{os.path.relpath(path, REPO)}  {[s for s, _ in blobs]}")


# Large surfaces get the full mark.
emit(full, 1024, DESKTOP, "build", "icon.png")
emit(full, 256, DESKTOP, "assets", "icon.png")
emit(full, 512, WEB, "icons", "icon-512.png")
emit(full, 192, WEB, "icons", "icon-192.png")

# Small surfaces get the glyph alone — the streaks are illegible below roughly 64px.
emit(compact, 32, WEB, "favicon-32.png")

# Tray: glyph on transparency. macOS reads only the alpha, having been told it is a template.
emit(tray, 16, DESKTOP, "assets", "tray.png")
emit(tray, 32, DESKTOP, "assets", "tray@2x.png")

ico_entries = [(s, compact) for s in (16, 24, 32, 48)] + [(s, full) for s in (64, 128, 256)]
write_ico(os.path.join(WEB, "favicon.ico"), ico_entries)
write_ico(os.path.join(DESKTOP, "build", "icon.ico"), ico_entries)

og.save(os.path.join(WEB, "og-image.png"), optimize=True)
written.append(f"apps/web/public/og-image.png  {og.width}x{og.height}")

for line in written:
    print("  wrote " + line)
