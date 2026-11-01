"""Render the Natex η logo (white on black) to PNG icons + SVG. Pure stdlib.

Usage: python3 tools/make_icons.py   (writes into icons/)
"""
import math, os, struct, zlib

# Geometry in a 128x128 box. Each stroke is a list of cubic bezier segments.
STROKES = [
    # top-left hook curling into the left stem
    [((33, 45), (35, 31), (50, 24), (51, 38)),
     ((51, 38), (51, 60), (51, 80), (51, 99))],
    # arch over to the right, long right leg, little flick at the bottom
    [((51, 52), (58, 34), (73, 28), (82, 34)),
     ((82, 34), (89, 39), (88, 52), (88, 64)),
     ((88, 64), (88, 80), (88, 96), (88, 106)),
     ((88, 106), (88, 114), (94, 116), (101, 111))],
]
STROKE_W = 11.5
RADIUS = 26  # background corner radius


def bez(p0, p1, p2, p3, n=24):
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        out.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return out


SEGS = []
for stroke in STROKES:
    pts = []
    for c in stroke:
        pts.extend(bez(*c))
    SEGS.extend(zip(pts, pts[1:]))


def seg_dist(px, py, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    l2 = dx*dx + dy*dy or 1e-9
    t = max(0.0, min(1.0, ((px-ax)*dx + (py-ay)*dy) / l2))
    return math.hypot(px - (ax + t*dx), py - (ay + t*dy))


def rrect_cov(x, y, s):
    # coverage of a rounded square of size 128 at sample (x,y) in 128-space, px=s
    r = RADIUS
    cx = min(max(x, r), 128 - r); cy = min(max(y, r), 128 - r)
    d = math.hypot(x - cx, y - cy) - r
    return max(0.0, min(1.0, 0.5 - d / s))


def render(size):
    s = 128 / size  # 128-space units per pixel
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            x, y = (i + .5) * s, (j + .5) * s
            bg = rrect_cov(x, y, s)
            d = min(seg_dist(x, y, a, b) for a, b in SEGS)
            fg = max(0.0, min(1.0, (STROKE_W / 2 - d) / s + 0.5))
            v = int(round(255 * fg))
            row += bytes([v, v, v, int(round(255 * bg))])
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def svg():
    paths = []
    for stroke in STROKES:
        d = 'M%g %g' % stroke[0][0] + ''.join(' C%g %g %g %g %g %g' % (*c[1], *c[2], *c[3]) for c in stroke)
        paths.append(f'<path d="{d}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
            f'<rect width="128" height="128" rx="{RADIUS}" fill="#000"/>'
            f'<g fill="none" stroke="#fff" stroke-width="{STROKE_W}" stroke-linecap="round" stroke-linejoin="round">'
            + ''.join(paths) + '</g></svg>\n')


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    for n in (16, 32, 48, 128):
        with open(os.path.join(out, f'icon{n}.png'), 'wb') as f:
            f.write(render(n))
    with open(os.path.join(out, 'natex.svg'), 'w') as f:
        f.write(svg())
    print('wrote icons to', os.path.normpath(out))
