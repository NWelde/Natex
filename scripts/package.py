"""Package the built extension using only Python's standard library."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "manifest.json").read_text())
version = json.loads((ROOT / "package.json").read_text())["version"]
def version_parts(value):
    parts = tuple(map(int, value.split(".")))
    return parts + (0,) * (4 - len(parts))


if version_parts(version) != version_parts(manifest["version"]):
    raise SystemExit("package.json and manifest.json versions must match")

files = [ROOT / name for name in (
    "manifest.json", "background.js", "popup.html", "options.html", "LICENSE",
    "PRIVACY.md", "styles/theme.css", "styles/popup.css", "styles/options.css",
)]
for directory in ("dist", "icons"):
    files.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())
for name in ("content.js", "page.js", "popup.js", "options.js"):
    if not (ROOT / "dist" / name).is_file():
        raise SystemExit(f"Missing dist/{name}; run npm run build first")
if not list((ROOT / "dist/katex/fonts").glob("*.woff2")):
    raise SystemExit("Missing KaTeX fonts; run npm run build first")

output = ROOT / "release" / f"natex-{version}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, path.relative_to(ROOT))
print(f"Created {output.relative_to(ROOT)}")
