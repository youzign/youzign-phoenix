type ExportImage = Pick<
  HTMLImageElement,
  "complete" | "decode" | "addEventListener" | "removeEventListener"
>;

type ExportRoot = Pick<HTMLElement, "querySelectorAll">;

export const EXPORT_IMAGE_TIMEOUT_MS = 15_000;

async function waitForImageLoad(
  image: ExportImage,
  timeoutMs = EXPORT_IMAGE_TIMEOUT_MS
): Promise<void> {
  if (image.complete) return;

  await new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timeout);
      image.removeEventListener("load", done);
      image.removeEventListener("error", done);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error("An image layer did not finish loading before export."));
    }, timeoutMs);
    // The image can finish between the initial check and listener setup.
    if (image.complete) done();
  });
}

/** Wait until every image layer has loaded and, where supported, decoded. */
export async function ensureExportImages(nodes: ExportRoot[]): Promise<void> {
  const images = nodes.flatMap((node) =>
    Array.from(node.querySelectorAll("img")) as ExportImage[]
  );

  await Promise.all(
    images.map(async (image) => {
      await waitForImageLoad(image);
      await image.decode?.().catch(() => undefined);
    })
  );
}
