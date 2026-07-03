type TauriGlobal = {
  dialog?: {
    open?: (options?: {
      multiple?: boolean;
      filters?: { name: string; extensions: string[] }[];
    }) => Promise<string | string[] | null>;
    save?: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  };
  fs?: {
    BaseDirectory?: { AppData?: unknown };
    readFile?: (path: string, options?: unknown) => Promise<Uint8Array>;
    readTextFile?: (path: string, options?: unknown) => Promise<string>;
    writeFile?: (path: string, data: Uint8Array, options?: unknown) => Promise<void>;
    writeTextFile?: (path: string, data: string, options?: unknown) => Promise<void>;
  };
  opener?: {
    openUrl?: (url: string) => Promise<void>;
  };
  path?: {
    BaseDirectory?: { AppData?: unknown };
  };
};

export interface PickFilesOptions {
  accept?: string | string[];
  multiple?: boolean;
}

export interface DebugRecord {
  type: string;
  [key: string]: unknown;
}

const DEBUG_LOG = "youzign-debug.log";
let debugQueue = Promise.resolve();

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
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "pdf") return "application/pdf";
  if (ext === "xml") return "application/xml";
  return "application/octet-stream";
}

function nameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || "file";
}

function acceptList(accept?: string | string[]): string[] {
  if (!accept) return [];
  return (Array.isArray(accept) ? accept : accept.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function acceptToExtensions(accept?: string | string[]): string[] {
  const out = new Set<string>();
  for (const item of acceptList(accept)) {
    if (item.startsWith(".")) out.add(item.slice(1).toLowerCase());
    else if (item === "image/*") {
      ["png", "jpg", "jpeg", "webp", "svg"].forEach((ext) => out.add(ext));
    } else if (item === "image/png") out.add("png");
    else if (item === "image/jpeg") {
      out.add("jpg");
      out.add("jpeg");
    } else if (item === "image/webp") out.add("webp");
    else if (item === "image/svg+xml") out.add("svg");
    else if (item === "application/xml" || item === "text/xml") out.add("xml");
  }
  return [...out];
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

function browserPickFiles(opts: PickFilesOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = acceptList(opts.accept).join(",");
    input.multiple = !!opts.multiple;
    input.style.position = "fixed";
    input.style.left = "-10000px";
    input.style.top = "-10000px";
    input.addEventListener(
      "change",
      () => {
        const files = Array.from(input.files ?? []);
        input.remove();
        resolve(files);
      },
      { once: true }
    );
    document.body.append(input);
    input.click();
  });
}

function bytesForFile(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function pickNativeFiles(opts: PickFilesOptions): Promise<File[] | null> {
  const api = tauri();
  if (!api?.dialog?.open || !api.fs?.readFile) return null;
  const extensions = acceptToExtensions(opts.accept);
  const selected = await api.dialog.open({
    multiple: !!opts.multiple,
    filters: extensions.length ? [{ name: "Files", extensions }] : undefined,
  });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  return Promise.all(
    paths.map(async (path) => {
      const bytes = await api.fs!.readFile!(path);
      const name = nameFromPath(path);
      return new File([bytesForFile(bytes)], name, {
        type: mimeFor(name),
        lastModified: Date.now(),
      });
    })
  );
}

export async function pickFiles(opts: PickFilesOptions = {}): Promise<File[]> {
  const nativeFiles = await pickNativeFiles(opts);
  if (nativeFiles) return nativeFiles;
  return browserPickFiles(opts);
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

function debugOptions(api: TauriGlobal): unknown {
  const baseDir = api.fs?.BaseDirectory?.AppData ?? api.path?.BaseDirectory?.AppData ?? "AppData";
  return { baseDir };
}

async function appendDebugLine(record: DebugRecord): Promise<void> {
  const api = tauri();
  if (!api?.fs) return;
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`;
  const options = debugOptions(api);
  if (api.fs.readTextFile && api.fs.writeTextFile) {
    let current = "";
    try {
      current = await api.fs.readTextFile(DEBUG_LOG, options);
    } catch {
      current = "";
    }
    await api.fs.writeTextFile(DEBUG_LOG, current + line, options);
    return;
  }
  if (api.fs.writeFile) {
    await api.fs.writeFile(DEBUG_LOG, new TextEncoder().encode(line), options);
  }
}

export function appendDebugLog(record: DebugRecord): void {
  if (!isTauri()) return;
  debugQueue = debugQueue
    .then(() => appendDebugLine(record))
    .catch((err) => {
      console.warn("Failed to append native debug log", err);
    });
}
