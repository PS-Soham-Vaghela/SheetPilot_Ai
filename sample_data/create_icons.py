"""
create_icons.py — generates minimal PNG icons for the Chrome extension.
Uses only Python stdlib (struct + zlib) — no Pillow required.

Run:
    python sample_data/create_icons.py
"""

import struct
import zlib
from pathlib import Path


def make_png(size: int, r: int, g: int, b: int) -> bytes:
    """
    Build a minimal valid PNG of `size x size` pixels filled with a solid colour.
    PNG spec: signature + IHDR + IDAT + IEND chunks.
    """

    def chunk(name: bytes, data: bytes) -> bytes:
        c = name + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    # PNG signature
    sig = b"\x89PNG\r\n\x1a\n"

    # IHDR: width, height, bit_depth=8, colour_type=2 (RGB), compression=0, filter=0, interlace=0
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))

    # IDAT: raw image data — one filter byte (0) per row, then RGB pixels
    raw_row = b"\x00" + bytes([r, g, b] * size)  # filter=None, then pixels
    raw = raw_row * size
    idat = chunk(b"IDAT", zlib.compress(raw, 9))

    # IEND
    iend = chunk(b"IEND", b"")

    return sig + ihdr + idat + iend


def main():
    icons_dir = Path(__file__).parent.parent / "extension" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)

    # SheetPilot blue: #1a73e8 → RGB(26, 115, 232)
    for size in [16, 48, 128]:
        png_bytes = make_png(size, 26, 115, 232)
        path = icons_dir / f"icon{size}.png"
        path.write_bytes(png_bytes)
        print(f"Created {path} ({size}x{size}, {len(png_bytes)} bytes)")


if __name__ == "__main__":
    main()
