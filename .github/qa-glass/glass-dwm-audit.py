"""Run an exact portable build against a bounded, synthetic Windows background."""
import ctypes as ct
from ctypes import wintypes as wt
import hashlib, json, os, random, socket, sqlite3, subprocess, sys, threading, time, winreg
from pathlib import Path
import tkinter as tk
from PIL import Image, ImageDraw, ImageGrab, ImageOps, ImageTk, ImageChops, ImageStat

work = Path.cwd()
exe, expected, out = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve()
assert out.parent == (work/'.local').resolve() and out.name.startswith('glass-session-')
out.mkdir()
with exe.open('rb') as f: assert hashlib.file_digest(f, 'sha256').hexdigest() == expected
assert os.environ.get('GITHUB_ACTIONS') == 'true', 'This launcher expects a fresh Windows runner'
for entry in ('Music Island', 'music-island'):
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run') as key:
            winreg.QueryValueEx(key, entry)
    except FileNotFoundError:
        pass
    else:
        raise RuntimeError('The Windows runner is not clean')
profile = out/'profile'
appdir = profile/'roaming'/'Music Island'
appdir.mkdir(parents=True)
for d in ['webview','local','temp']: (profile/d).mkdir()
env = dict(os.environ, APPDATA=str(profile/'roaming'), LOCALAPPDATA=str(profile/'local'), TEMP=str(profile/'temp'),TMP=str(profile/'temp'),
    WEBVIEW2_USER_DATA_FOLDER=str(profile/'webview'))
port = None
for proposed_port in random.sample(range(42001, 48000), 16):
    try:
        with socket.socket() as reserve:
            reserve.bind(('127.0.0.1', proposed_port))
        port = proposed_port
        break
    except OSError:
        continue
assert port
env['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = (
    f'--remote-debugging-port={port} --remote-debugging-address=127.0.0.1 '
    f'--enable-logging --log-file="{out / "webview-runtime.log"}"'
)
env.update(HTTPS_PROXY='http://127.0.0.1:9', HTTP_PROXY='http://127.0.0.1:9', NO_PROXY='localhost,127.0.0.1')
user32=ct.WinDLL('user32',use_last_error=True)
user32.SetWindowPos.argtypes=[wt.HWND,wt.HWND,ct.c_int,ct.c_int,ct.c_int,ct.c_int,wt.UINT]
user32.SetWindowPos.restype=wt.BOOL
user32.SetProcessDpiAwarenessContext(ct.c_void_p(-4))
root=tk.Tk(); root.title('Music Island — glass QA background')
root.overrideredirect(True);root.attributes('-topmost',True)
w=min(1120, user32.GetSystemMetrics(0)-12); h=min(495, user32.GetSystemMetrics(1)-50)
x=(user32.GetSystemMetrics(0)-w)//2; y=0
root.geometry(f'{w}x{h}+{x}+{y}')
photo=ImageOps.fit(Image.open(work/'src/assets/preview-sea-stack.webp').convert('RGB'),(w,h))
def pattern(kind):
    im=photo.copy()
    if kind.startswith('fine'):
        draw=ImageDraw.Draw(im)
        for n in range(0,w,4):
            col=(219,219,219) if (n//4+(kind=='fineB'))%2 else (34,34,34)
            draw.rectangle((n,0,n+3,h),fill=col)
    elif kind!='photo':
        draw=ImageDraw.Draw(im)
        for n in range(0,w,48):
            co=(226,219,196) if (n//48+(kind=='B'))%2 else (41,63,81)
            draw.rectangle((n,0,n+47,h),fill=co)
        for n in range(0,w,6):
            draw.line((n,0,n,h),fill=(128,125,123))
    d=ImageDraw.Draw(im)
    for dx,dy in [(0,0),(w-14,0),(0,h-14),(w-14,h-14)]:
        d.rectangle((dx,dy,dx+13,dy+13),fill=(19,177,114))
    return im
surface=tk.Label(root,bd=0,highlightthickness=0);surface.pack()
def paint(kind):
    surface.ref=ImageTk.PhotoImage(pattern(kind));surface.configure(image=surface.ref);root.update_idletasks()
paint('photo');root.update();root.lift()
cmdline=subprocess.check_output(['tasklist','/fi','imagename eq music-island.exe','/fo','csv','/nh'],text=True,errors='replace')
assert '"music-island.exe"' not in cmdline.lower(), 'Another running instance owns the desktop'
start=subprocess.STARTUPINFO();start.dwFlags |= subprocess.STARTF_USESHOWWINDOW;start.wShowWindow=0
appout=(out/'app.stdout.log').open('wb')
apperr=(out/'app.stderr.log').open('wb')
app=subprocess.Popen([str(exe),'--startup'],cwd=exe.parent,env=env,startupinfo=start,
                     stdout=appout,stderr=apperr,creationflags=subprocess.CREATE_NO_WINDOW)
script=work/'.github/qa-glass/check-native-glass-controls.mjs'
log=(out/'webview.log').open('w',encoding='utf-8')
qa=subprocess.Popen(['node',str(script),str(port),str(out),str(app.pid),*sys.argv[4:]],cwd=work,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
begin=time.monotonic(); prev=None
def owned_hwnd(name):
    found=[]
    def visit(hwnd,_):
        pid=wt.DWORD();user32.GetWindowThreadProcessId(hwnd,ct.byref(pid))
        if pid.value==app.pid:
            title=ct.create_unicode_buffer(260);user32.GetWindowTextW(hwnd,title,260)
            if title.value==name: found.append(hwnd)
        return True
    user32.EnumWindows(ct.WINFUNCTYPE(wt.BOOL,wt.HWND,wt.LPARAM)(visit),0)
    return found[0] if len(found)==1 else None
def inspect_window(hwnd):
    rect=wt.RECT();user32.GetWindowRect(hwnd,ct.byref(rect))
    kind=ct.create_unicode_buffer(200);user32.GetClassNameW(hwnd,kind,200)
    pix=wt.DWORD(); alpha=ct.c_ubyte(); flags=wt.DWORD(); layer=user32.GetLayeredWindowAttributes(hwnd,ct.byref(pix),ct.byref(alpha),ct.byref(flags))
    cloak=wt.DWORD();ct.windll.dwmapi.DwmGetWindowAttribute(hwnd,14,ct.byref(cloak),4)
    return dict(hwnd=hwnd,cls=kind.value,rect=[rect.left,rect.top,rect.right,rect.bottom],visible=user32.IsWindowVisible(hwnd),
                ex=hex(user32.GetWindowLongW(hwnd,-20)&0xffffffff),alpha=alpha.value if layer else None,flags=flags.value,cloak=cloak.value)
def window_tree(hwnd):
    result=[inspect_window(hwnd)]
    def child(h,_): result.append(inspect_window(h)); return True
    user32.EnumChildWindows(hwnd,ct.WINFUNCTYPE(wt.BOOL,wt.HWND,wt.LPARAM)(child),0)
    return result
def capture(stage):
    # Only retain the bounded calibration window. Discard if other windows cover its corners.
    x0,y0=surface.winfo_rootx(),surface.winfo_rooty()
    fixture_hwnd=user32.GetAncestor(surface.winfo_id(),2)
    def check_stack():
        guard={'reached':False,'occluded':False}
        def visit(hwnd,_):
            if hwnd==fixture_hwnd: guard['reached']=True;return False
            if not user32.IsWindowVisible(hwnd) or user32.IsIconic(hwnd): return True
            pid=wt.DWORD();user32.GetWindowThreadProcessId(hwnd,ct.byref(pid))
            if pid.value in (app.pid,os.getpid()): return True
            cloak=wt.DWORD();ct.windll.dwmapi.DwmGetWindowAttribute(hwnd,14,ct.byref(cloak),4)
            if cloak.value: return True
            rect=wt.RECT();user32.GetWindowRect(hwnd,ct.byref(rect))
            if rect.right>x0 and rect.left<x0+w and rect.bottom>y0 and rect.top<y0+h and rect.right>rect.left and rect.bottom>rect.top:
                guard['occluded']=True;return False
            return True
        user32.EnumWindows(ct.WINFUNCTYPE(wt.BOOL,wt.HWND,wt.LPARAM)(visit),0)
        assert guard['reached'] and not guard['occluded'], 'Another window covers the bounded fixture'
    check_stack()
    frame=ImageGrab.grab((x0,y0,x0+w,y0+h),all_screens=True,include_layered_windows=True)
    check_stack()
    points=[(4,4),(w-4,4),(4,h-4),(w-4,h-4)]
    if not all(max(abs(a-b) for a,b in zip(frame.getpixel((i,j))[:3],(19,177,114))) < 12 for i,j in points):
        raise RuntimeError('Calibration window obscured at guard corner: '+str([frame.getpixel(p) for p in points])+' at '+str((x0,y0,w,h)))
    frame.save(out/(stage+'.png'))
def verify_pixels():
    def diff(name, other, roi):
        a=Image.open(out/(name+'.png')).convert('RGB').crop(roi)
        b=Image.open(out/(other+'.png')).convert('RGB').crop(roi)
        return ImageChops.difference(a,b)
    box=(w//2-80,h-125,w//2+80,h-72)
    delta=diff('fox-photo','island-photo',box)
    colors=Image.open(out/'fox-photo.png').convert('RGB').crop(box)
    changed=sum(max(px)>16 for px in delta.getdata())
    orange=sum(max(d)>16 and r>g*1.35 and g>b+9 for d,(r,g,b) in zip(delta.getdata(),colors.getdata()))
    proof={'foxChangedPixels':changed, 'foxColoredPixels':orange,'foxPixelBounds':box}
    assert changed>650 and orange>24, f'Recording HWND or its orange fox was not visible in the physical screenshot: {proof}'
    if '--tuning' in sys.argv:
        geo=json.loads((out/'geometry.json').read_text('utf8'))
        rect=geo['rect'];scale=geo['scale']
        # Both the calibration panel and the main viewport are centered on the
        # primary monitor, with their top edge anchored to y=0. The name of the
        # window can change when settings is shown; its published bounds don't.
        assert abs((rect['x']+rect['width']/2)-geo['viewport'][0]/2)<4 and abs(rect['y'])<3
        rx=round(w/2+(rect['x']+rect['width']*.10-geo['viewport'][0]/2)*scale)
        ry=round((rect['y']+rect['height']*.20)*scale)
        box=(rx,ry,rx+32,ry+9)
        assert box[0]>=0 and box[2]<w and box[1]>=0 and box[3]<h,box
        proof['materialPixelBounds']=box; proof['material']={}
        for setting in ('opaque','default','clear','frost0','frost100'):
            p='tune-'+setting+'-'
            result={}
            for key,a,b in [('broad','A','B'),('fine','fineA','fineB')]:
                result[key]=round(sum(ImageStat.Stat(diff(p+a,p+b,box)).mean)/3,2)
            proof['material'][setting]=result
        d=proof['material']
        (out/'pixel-proof.json').write_text(json.dumps(proof,indent=2))
        assert d['opaque']['broad']+4<d['default']['broad'] and d['default']['broad']+3<d['clear']['broad'],f'transparency progression not visible on desktop: {d}'
        assert d['frost0']['fine']>d['frost100']['fine']+5, f'frost endpoints did not change fine detail: {d}'
    (out/'pixel-proof.json').write_text(json.dumps(proof,indent=2))
def tick():
    global prev
    request=out/'request'
    if request.exists():
        txt=request.read_text().strip()
        if txt and txt!=prev:
            prev=txt
            try:
                mode,name=txt.split()
                if mode=='paint':
                    paint(name)
                    main=owned_hwnd('Music Island')
                    if main: user32.SetWindowPos(main,-1,0,0,0,0,0x13)
                    recorder=owned_hwnd('Recording')
                    if recorder and user32.IsWindowVisible(recorder): user32.SetWindowPos(recorder,-1,0,0,0,0,0x13)
                elif mode=='capture': capture(name)
                elif mode=='verify': verify_pixels()
                elif mode=='seed':
                    db=appdir/'dictation'/'history.db'
                    assert db.is_file()
                    with sqlite3.connect(db,timeout=4) as conn:
                        conn.execute('INSERT INTO transcription_history (file_name, timestamp, saved, title, transcription_text) VALUES (?,?,?,?,?)',('glass-test.wav',int(time.time()),0,'Проверка стекла','Тестовая фраза на полупрозрачной плашке.'))
                elif mode=='recorder':
                    # Put only our test recorder on the known backdrop, without a microphone capture.
                    handles=[]
                    def visit(hwnd,_):
                        pid=wt.DWORD();user32.GetWindowThreadProcessId(hwnd,ct.byref(pid))
                        if pid.value==app.pid:
                            title=ct.create_unicode_buffer(260);user32.GetWindowTextW(hwnd,title,260)
                            if title.value=='Recording': handles.append(hwnd)
                        return True
                    user32.EnumWindows(ct.WINFUNCTYPE(wt.BOOL,wt.HWND,wt.LPARAM)(visit),0)
                    assert len(handles)==1, ('Recorder HWND count',len(handles))
                    handle=handles[0]
                    before=window_tree(handle)
                    cw,ch=(400,120) if name=='expanded' else (256,50)
                    user32.ShowWindow(handle,4)
                    if not user32.SetWindowPos(handle,wt.HWND(-1),x+(w-cw)//2,h-125,cw,ch,0x50):
                        raise RuntimeError(f'Could not position QA recorder {before}: '+str(ct.WinError(ct.get_last_error())))
                    after=window_tree(handle)
                    (out/f'hwnd-{name}.json').write_text(json.dumps(dict(before=before,after=after),indent=2))
                (out/'ack').write_text(txt)
            except Exception as e: (out/'ack').write_text('ERROR '+str(e))
    if qa.poll() is not None or app.poll() is not None or time.monotonic()-begin>200: root.quit()
    else: root.after(30,tick)
root.after(40,tick)
try: root.mainloop()
finally:
    print(f'Candidate status at test completion: {app.poll()}; JS driver: {qa.poll()}', flush=True)
    if qa.poll() is None: qa.terminate()
    if app.poll() is None: app.terminate();app.wait(timeout=10)
    root.destroy();log.close();appout.close();apperr.close()
    for diagnostic in ['app.stderr.log', 'profile/roaming/Music Island/logs/app.log', 'webview-runtime.log']:
        file = out/diagnostic
        if file.exists():
            print(diagnostic, *file.read_text('utf-8',errors='replace').splitlines()[-16:], sep='\n')
print((out/'webview.log').read_text('utf-8'),flush=True)
sys.exit(qa.wait(timeout=10))
