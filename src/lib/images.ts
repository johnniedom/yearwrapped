// Utilities to make user-uploaded images export reliably on iOS Safari.
// Converts HEIC/HEIF -> JPEG, then downscales to avoid iOS canvas memory limits.

import heic2any from "heic2any";

const isIOS = () =>
  typeof navigator !== "undefined" && /iP(ad|hone|od)/.test(navigator.userAgent);

const isHeic = (file: File) => {
  const t = (file.type || "").toLowerCase();
  const n = (file.name || "").toLowerCase();
  return t === "image/heic" || t === "image/heif" || n.endsWith(".heic") || n.endsWith(".heif");
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

const downscaleDataUrl = async (dataUrl: string, maxDim: number) => {
  const img = new Image();
  img.decoding = "async";
  img.src = dataUrl;

  // iOS sometimes throws on decode; fall back to onload.
  try {
    await img.decode?.();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image decode failed"));
    });
  }

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return dataUrl;

  const scale = Math.min(1, maxDim / Math.max(w, h));
  if (scale >= 1) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // JPEG is broadly supported for canvas export across iOS.
  return canvas.toDataURL("image/jpeg", 0.92);
};

export const fileToCanvasSafeDataUrl = async (file: File) => {
  let blob: Blob = file;

  // HEIC/HEIF -> JPEG for canvas compatibility.
  if (isHeic(file)) {
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }

  let dataUrl = await blobToDataUrl(blob);

  // iOS Safari is extremely sensitive to large canvases.
  if (isIOS()) {
    dataUrl = await downscaleDataUrl(dataUrl, 1600);
  }

  return dataUrl;
};

export const waitForImagesInNode = async (node: HTMLElement) => {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.src) return;

      if (!img.complete || img.naturalWidth === 0) {
        await new Promise<void>((resolve) => {
          const done = () => {
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          };
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        });
      }

      try {
        await img.decode?.();
      } catch {
        // ignore
      }
    }),
  );
};
