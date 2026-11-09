"""Build the downloadable kit from the same assets deployed to the private lab."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
assets = ("index.html", "styles.css", "app.mjs", "model.mjs", "bench.mjs",
          "sensor-bench.html", "sensor-bench.css", "sensor-bench.mjs")
kit = ("README.txt", "start_bench.py", "sensor_bench.py", "Start-TM172-Bench.cmd",
       "PLC-SETUP.txt", "TM172-Selector.st")
files = {f"web/{name}": root / "dist" / name for name in assets}
files.update({name: root / "bench" / name for name in kit})
for name in ("PLC-SETUP.txt", "TM172-Selector.st"):
    path = root / "bench" / name
    (root / "dist" / name).write_bytes(path.read_bytes())
    files[f"web/{name}"] = path
with ZipFile(root / "dist" / "tm172-bench-kit.zip", "w", compression=ZIP_DEFLATED) as archive:
    for name, path in files.items():
        content = path.read_bytes()
        if path.suffix == ".cmd":
            content = content.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        archive.writestr(ZipInfo(f"TM172-Bench/{name}"), content, compress_type=ZIP_DEFLATED)
