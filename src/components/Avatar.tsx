"use client";

/** Round profile photo, or the initial on a role-coloured disc when there is none. */
export function Avatar({ id, name, at, size = 40, kind = "fugitive" }: {
  id: string; name: string; at?: number | null; size?: number; kind?: "hunter" | "fugitive" | "ghost";
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (at) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="av" src={`/api/avatar/${id}?v=${at}`} alt="" style={style} draggable={false} />;
  }
  return <span className={`av av-${kind}`} style={style} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

/** Crops the photo to a centred square, scales it to 256 px and compresses it to JPEG on the phone. */
export async function makeAvatar(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size < 280 * 1024) return blob;
  }
  throw new Error("Foto troppo pesante.");
}

export async function uploadAvatar(file: File) {
  const blob = await makeAvatar(file);
  const res = await fetch("/api/avatar", { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Foto non caricata. Riprova.");
}

/** Tap target that opens the photo picker and uploads the new photo. */
export function AvatarPicker({ id, name, at, size = 40, kind, onDone, onError }: {
  id: string; name: string; at?: number | null; size?: number; kind?: "hunter" | "fugitive" | "ghost";
  onDone: () => void; onError: (msg: string) => void;
}) {
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      await uploadAvatar(f);
      onDone();
    } catch (err) {
      onError((err as Error).message);
    }
  };
  return (
    <label className="avpick" title="Cambia foto profilo" aria-label="Cambia foto profilo">
      <Avatar id={id} name={name} at={at} size={size} kind={kind} />
      <span className="avpick-badge" aria-hidden="true">+</span>
      <input type="file" accept="image/*" hidden onChange={pick} />
    </label>
  );
}
