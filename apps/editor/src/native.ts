type TauriGlobal = {
  dialog?: {
    save?: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  };
  fs?: {
    writeFile?: (path: string, data: Uint8Array) => Promise<void>;
  };
  opener?: {
    openUrl?: (url: string) => Promise<void>;
  };
};

function tauri(): TauriGlobal | null {
  return typeof window !== "undefined" ? ((window as any).__TAURI__ ?? null) : null;
}

export function isTauri(): boolean {
  return !!tauri();
}

function extension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "txt";
}

function mimeFor(filename: string): string {
  const ext = extension(filename);
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "pdf") return "application/pdf";
  if (ext === "xml") return "application/xml";
  return "application/octet-stream";
}

function anchorDownload(url: string, filename: string, revoke = false): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  if (revoke) URL.revokeObjectURL(url);
}

function bytesToDataUrl(bytes: Uint8Array, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    reader.readAsDataURL(new Blob([copy], { type: mimeFor(filename) }));
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const marker = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, marker);
  const body = dataUrl.slice(marker + 1);
  const binary = meta.includes(";base64") ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function saveNative(bytes: Uint8Array, filename: string): Promise<boolean> {
  const api = tauri();
  if (!api?.dialog?.save || !api.fs?.writeFile) return false;
  const path = await api.dialog.save({
    defaultPath: filename,
    filters: [{ name: extension(filename).toUpperCase(), extensions: [extension(filename)] }],
  });
  if (!path) return true;
  await api.fs.writeFile(path, bytes);
  return true;
}

export async function saveDataUrl(dataUrl: string, filename: string): Promise<void> {
  if (await saveNative(dataUrlToBytes(dataUrl), filename)) return;
  anchorDownload(dataUrl, filename);
}

export async function saveBytes(bytes: Uint8Array, filename: string): Promise<void> {
  if (await saveNative(bytes, filename)) return;
  anchorDownload(await bytesToDataUrl(bytes, filename), filename);
}

export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (await saveNative(bytes, filename)) return;
  anchorDownload(URL.createObjectURL(blob), filename, true);
}

export async function openExternal(url: string): Promise<void> {
  const api = tauri();
  if (api?.opener?.openUrl) {
    await api.opener.openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
