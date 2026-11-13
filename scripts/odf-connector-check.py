"""Check that every connector of every diagram in an .odt is attached, and still attached after a move.

Opens the document in headless LibreOffice through UNO, walks each `draw:g` group, and for each
connector checks that both ends are bound to a shape. Then moves the end shape of the group's first
connector 2 cm right and checks that the connector end is on that shape's glue point where it now
is. Prints one JSON line per group.

Usage: /usr/bin/python3 scripts/odf-connector-check.py doc.odt [soffice binary]
Exit code 1 if any connector is detached or did not follow. Needs python3-uno (system Python).
"""
import json, os, sys, time, subprocess, tempfile, uno
from com.sun.star.beans import PropertyValue
from com.sun.star.awt import Point

src = os.path.abspath(sys.argv[1])
soffice = sys.argv[2] if len(sys.argv) > 2 else "soffice"
profile = uno.systemPathToFileUrl(tempfile.mkdtemp(prefix="lo-odf-check-"))
port = 2000 + os.getpid() % 1000
proc = subprocess.Popen([soffice, "--headless", "--norestore", "--nologo", "-env:UserInstallation=" + profile,
                         f"--accept=socket,host=127.0.0.1,port={port};urp;"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
ctx = None
for _ in range(120):
    try:
        ctx = resolver.resolve(f"uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext")
        break
    except Exception:
        time.sleep(0.5)  # LibreOffice still starting
if ctx is None:
    proc.kill()
    sys.exit("could not connect to LibreOffice")
desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)

def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p

doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(src), "_blank", 0, (pv("Hidden", True),))
page = doc.getDrawPage()
failed = False
for gi in range(page.getCount()):
    group = page.getByIndex(gi)
    if not group.supportsService("com.sun.star.drawing.GroupShape"):
        continue
    children = [group.getByIndex(i) for i in range(group.getCount())]
    connectors = [s for s in children if s.supportsService("com.sun.star.drawing.ConnectorShape")]
    detached = [c.Name for c in connectors if c.StartShape is None or c.EndShape is None]
    followed = None
    detail = None
    if connectors and not detached:
        # Move the end shape of the first connector, then check the connector end sits on that shape's
        # glue point where the shape now is. (Not "moved by 2 cm": LibreOffice may shift the whole
        # as-char group when its extent changes, so the shape's own move is what counts.)
        c = connectors[0]
        target, other = c.EndShape, c.StartShape
        pos, other_before = target.getPosition(), other.getPosition()
        target.setPosition(Point(pos.X + 2000, pos.Y))
        p, z = target.getPosition(), target.getSize()
        other_after = other.getPosition()
        glue = {0: (p.X + z.Width / 2, p.Y), 1: (p.X + z.Width, p.Y + z.Height / 2),
                2: (p.X + z.Width / 2, p.Y + z.Height), 3: (p.X, p.Y + z.Height / 2)}.get(c.EndGluePointIndex)
        end = c.EndPosition
        # Relative to the connector's other shape: moving the group's leftmost shape right makes
        # LibreOffice shift the group back left, so page coordinates alone can show no move.
        moved = abs((p.X - other_after.X) - (pos.X - other_before.X) - 2000) <= 60
        followed = c.EndShape is not None and moved and glue is not None and abs(end.X - glue[0]) <= 60 and abs(end.Y - glue[1]) <= 60
        detail = {"connector": c.Name, "endShape": target.Name, "glue": c.EndGluePointIndex,
                  "movedRelativeToStart": (p.X - other_after.X) - (pos.X - other_before.X), "end": [end.X, end.Y], "gluePoint": glue}
    shapes = sum(1 for s in children if not s.supportsService("com.sun.star.drawing.ConnectorShape"))
    ok = not detached and followed is not False
    failed = failed or not ok
    print(json.dumps({"group": group.Name, "shapes": shapes, "connectors": len(connectors),
                      "detached": detached, "followsMove": followed, "ok": ok, **({"detail": detail} if followed is False else {})}))
doc.close(True)
try:
    desktop.terminate()
except Exception:
    pass  # the office process exits on terminate; the dropped bridge is expected
proc.wait(timeout=60)
sys.exit(1 if failed else 0)
