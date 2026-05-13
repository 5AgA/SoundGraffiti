/** @typedef {{ x: number; y: number; width: number; height: number }} PixelCrop */

const MAX_OUTPUT_EDGE = 512;

/**
 * @param {string} imageSrc
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(imageSrc) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () =>
      reject(new Error("이미지를 불러올 수 없어요.")),
    );
    img.src = imageSrc;
  });
}

/**
 * @param {string} imageSrc
 * @param {PixelCrop} pixelCrop
 * @param {string} originalFileName
 * @param {number} [quality=0.92]
 * @param {number} [maxOutputEdge=MAX_OUTPUT_EDGE] 긴 변 기준 최대 픽셀(이하로 축소만)
 * @returns {Promise<File | null>}
 */
export async function getCroppedImageFile(
  imageSrc,
  pixelCrop,
  originalFileName,
  quality = 0.92,
  maxOutputEdge = MAX_OUTPUT_EDGE,
) {
  const image = await loadImage(imageSrc);
  const maxEdge = Math.max(pixelCrop.width, pixelCrop.height);
  const cap =
    typeof maxOutputEdge === "number" &&
    Number.isFinite(maxOutputEdge) &&
    maxOutputEdge > 0
      ? maxOutputEdge
      : MAX_OUTPUT_EDGE;
  const scale = maxEdge > cap ? cap / maxEdge : 1;
  const outW = Math.round(pixelCrop.width * scale);
  const outH = Math.round(pixelCrop.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH,
  );

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
  if (!blob) return null;

  const base =
    typeof originalFileName === "string" && originalFileName.trim()
      ? originalFileName.replace(/\.[^.]+$/, "")
      : "profile";
  return new File([blob], `${base || "profile"}.jpg`, {
    type: "image/jpeg",
  });
}
