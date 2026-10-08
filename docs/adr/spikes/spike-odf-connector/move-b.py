"""S1 spike: open an .odt in headless LibreOffice, move shape B 3 cm down, save. Usage: move-b.py in.odt out.odt"""
import os, sys, time, subprocess, tempfile, uno
from com.sun.star.beans import PropertyValue
from com.sun.star.awt import Point

src, out_odt = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
profile = uno.systemPathToFileUrl(tempfile.mkdtemp(prefix="lo-spike-"))
proc = subprocess.Popen(["soffice", "--headless", "--norestore", "-env:UserInstallation=" + profile,
                         "--accept=socket,host=127.0.0.1,port=2099;urp;"])
local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
for _ in range(60):
    try:
        ctx = resolver.resolve("uno:socket,host=127.0.0.1,port=2099;urp;StarOffice.ComponentContext"); break
    except Exception:
        time.sleep(0.5)
desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p
doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(src), "_blank", 0, (pv("Hidden", True),))
page = doc.getDrawPage()
def dump(tag):
    for i in range(page.getCount()):
        s = page.getByIndex(i)
        p = s.getPosition(); z = s.getSize()
        extra = ""
        if s.supportsService("com.sun.star.drawing.ConnectorShape"):
            st, en = s.StartShape, s.EndShape
            extra = f" start={st.Name if st else None}@{s.StartGluePointIndex} end={en.Name if en else None}@{s.EndGluePointIndex} startPos={s.StartPosition.X},{s.StartPosition.Y} endPos={s.EndPosition.X},{s.EndPosition.Y}"
        print(f"{tag} [{i}] {s.ShapeType} name={s.Name!r} pos={p.X},{p.Y} size={z.Width}x{z.Height}{extra}")
dump("before")
b = next(page.getByIndex(i) for i in range(page.getCount()) if page.getByIndex(i).Name == "B")
pos = b.getPosition()
b.setPosition(Point(pos.X, pos.Y + 3000))  # 3 cm down (1/100 mm)
dump("after ")
doc.storeToURL(uno.systemPathToFileUrl(out_odt), ())
doc.close(True)
try: desktop.terminate()
except Exception: pass  # the office process exits on terminate; the bridge drop is expected
proc.wait(timeout=30)
