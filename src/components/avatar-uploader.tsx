"use client";
/* eslint-disable @next/next/no-img-element -- avatars are private signed URLs / blob previews, not optimisable static images */
import { useRef, useState, useTransition } from "react";
import { askConfirm, toast } from "@/lib/feedback-bus";
import { useRouter } from "next/navigation";
import { Camera, Minus, Plus, Trash2 } from "lucide-react";
import { Button, ErrorNote } from "./ui";
import { uploadAvatar, removeAvatar } from "@/app/actions/profile";
import { MAX_ZOOM, OUTPUT_SIZE, baseScale, clampOffset, rezoomOffset, sourceRect } from "@/lib/avatar-crop";

const V = 280; // crop viewport (CSS px)

/** Upload → crop (drag, zoom, arrow keys) → save; plus Remove. Cropping happens in the browser, which also strips EXIF/location data. */
export function AvatarUploader({ currentUrl, initial }: { currentUrl: string | null; initial: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null); const input = useRef<HTMLInputElement>(null); const imgRef = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>(); const [nat, setNat] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1); const [pos, setPos] = useState({ x: 0, y: 0 });
  const [err, setErr] = useState<string>(); const [msg, setMsg] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition(); const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const scale = nat.w ? baseScale(nat.w, nat.h, V) * zoom : 1; const dw = nat.w * scale, dh = nat.h * scale;
  const close = () => { dialog.current?.close(); if (src) URL.revokeObjectURL(src); setSrc(undefined); if (input.current) input.current.value = ""; };

  const pick = (f: File | undefined) => {
    setErr(undefined); setMsg(undefined); if (!f) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { setErr("Choose a JPG, PNG, WebP or GIF image."); return; }
    if (f.size > 10 * 1024 * 1024) { setErr("That file is over 10 MB."); return; }
    setSrc(URL.createObjectURL(f)); setZoom(1); dialog.current?.showModal();
  };
  const onLoad = () => {
    const el = imgRef.current!; const w = el.naturalWidth, h = el.naturalHeight; setNat({ w, h });
    const s = baseScale(w, h, V); setPos(clampOffset((V - w * s) / 2, (V - h * s) / 2, w * s, h * s, V)); // start centred
  };
  const setZ = (z: number) => { const nz = Math.min(MAX_ZOOM, Math.max(1, z)); const s0 = baseScale(nat.w, nat.h, V) * zoom, s1 = baseScale(nat.w, nat.h, V) * nz; setPos((p) => rezoomOffset(p.x, p.y, s0, s1, nat.w, nat.h, V)); setZoom(nz); };
  const move = (dx: number, dy: number) => setPos((p) => clampOffset(p.x + dx, p.y + dy, dw, dh, V));

  const save = () => {
    const el = imgRef.current; if (!el || !nat.w) return; setErr(undefined);
    const r = sourceRect(pos.x, pos.y, scale, V);
    const c = document.createElement("canvas"); c.width = c.height = OUTPUT_SIZE; const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE); ctx.imageSmoothingQuality = "high";
    ctx.drawImage(el, r.sx, r.sy, r.size, r.size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    c.toBlob((blob) => {
      if (!blob) { setErr("Could not process the image."); return; }
      const fd = new FormData(); fd.set("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      start(async () => { const res = await uploadAvatar(undefined, fd); if (res?.error) setErr(res.error); else { setMsg(res?.ok); close(); router.refresh(); } });
    }, "image/jpeg", 0.88);
  };
  const remove = () => { void askConfirm({ title: "Remove profile picture?", message: "Your photo will be deleted and your initial will be shown instead.", confirmLabel: "Yes, remove" }).then((ok) => { if (!ok) return; setErr(undefined); start(async () => { const res = await removeAvatar(); if (res?.error) setErr(res.error); else { setMsg(res?.ok); if (res?.ok) toast(res.ok); router.refresh(); } }); }); };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="avatar-ring"><div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-surface text-2xl font-semibold text-brand">
          {currentUrl ? <img src={currentUrl} alt="Your profile picture" className="h-full w-full object-cover" /> : initial}</div></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => input.current?.click()} disabled={pending}><Camera size={16} aria-hidden />{currentUrl ? "Change photo" : "Upload photo"}</Button>
          {currentUrl && <Button type="button" variant="outline" onClick={remove} disabled={pending}><Trash2 size={16} aria-hidden />Remove</Button>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" aria-label="Choose a profile photo" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <p className="mt-2 text-xs text-muted">JPG, PNG, WebP or GIF up to 10 MB. You can crop and zoom before saving.</p>
      {err && !src && <div className="mt-2"><ErrorNote>{err}</ErrorNote></div>}
      {msg && <p role="status" className="mt-2 text-sm text-good">{msg}</p>}

      <dialog ref={dialog} onClose={() => { if (src) { URL.revokeObjectURL(src); setSrc(undefined); } }} aria-labelledby="crop-title" className="pop m-auto w-[min(94vw,26rem)] rounded-2xl p-5 text-fg backdrop:bg-black/40 backdrop:backdrop-blur-sm">
        <h2 id="crop-title" className="text-lg font-semibold">Crop your photo</h2>
        <p className="mt-0.5 text-sm text-muted">Drag to reposition. Use the slider, mouse wheel or +/− to zoom.</p>
        <div className="mx-auto mt-4 select-none" style={{ width: V }}>
          <div tabIndex={0} role="application" aria-label="Crop area. Use arrow keys to move the photo, plus and minus to zoom."
            className="relative touch-none overflow-hidden rounded-xl bg-surface2 outline-none focus-visible:ring-2 focus-visible:ring-brand" style={{ width: V, height: V, cursor: dragging ? "grabbing" : "grab" }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y }; setDragging(true); }}
            onPointerMove={(e) => { const d = drag.current; if (!d) return; setPos(clampOffset(d.ox + e.clientX - d.px, d.oy + e.clientY - d.py, dw, dh, V)); }}
            onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }}
            onWheel={(e) => setZ(zoom - e.deltaY * 0.002)}
            onKeyDown={(e) => { const k = e.key; const step = 12; if (k === "ArrowLeft") move(step, 0); else if (k === "ArrowRight") move(-step, 0); else if (k === "ArrowUp") move(0, step); else if (k === "ArrowDown") move(0, -step); else if (k === "+" || k === "=") setZ(zoom + 0.1); else if (k === "-") setZ(zoom - 0.1); else return; e.preventDefault(); }}>
            {src && <img ref={imgRef} src={src} alt="" draggable={false} onLoad={onLoad}
              style={{ position: "absolute", left: 0, top: 0, width: nat.w ? dw : "auto", height: nat.w ? dh : "auto", maxWidth: "none", transform: `translate(${pos.x}px, ${pos.y}px)`, opacity: nat.w ? 1 : 0 }} />}
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 999px rgba(8, 10, 30, .55), inset 0 0 0 2px rgba(255,255,255,.85)" }} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" aria-label="Zoom out" className="icon-btn !h-8 !w-8" onClick={() => setZ(zoom - 0.2)}><Minus size={14} /></button>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} aria-label="Zoom" onChange={(e) => setZ(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-[var(--brand)]" />
            <button type="button" aria-label="Zoom in" className="icon-btn !h-8 !w-8" onClick={() => setZ(zoom + 0.2)}><Plus size={14} /></button>
          </div>
        </div>
        {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={save} disabled={pending || !nat.w}>{pending ? "Saving…" : "Save photo"}</Button>
        </div>
      </dialog>
    </div>
  );
}
