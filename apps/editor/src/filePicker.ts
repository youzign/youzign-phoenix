export interface PickLocalFileOptions {
  accept: string;
}

export function pickLocalFile({ accept }: PickLocalFileOptions): Promise<File | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let done = false;
    input.type = "file";
    input.accept = accept;
    input.className = "hidden";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    document.body.appendChild(input);

    const cleanup = () => {
      input.removeEventListener("change", onChange);
      window.removeEventListener("focus", onFocus);
      input.remove();
    };
    const finish = (file: File | null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(file);
    };
    const onChange = () => {
      finish(input.files?.[0] ?? null);
    };
    const onFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 250);
    };

    input.addEventListener("change", onChange);
    window.addEventListener("focus", onFocus);
    input.click();
  });
}
