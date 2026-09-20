/** Max square dimension logos are downscaled to before being stored as a data URL. */
const LOGO_MAX_DIMENSION = 512;
/** Avatars are smaller than the business logo — keeps table-row thumbnails cheap. */
const AVATAR_MAX_DIMENSION = 256;

/**
 * Reads an image file, downscales it to fit within `maxDimension` (keeping
 * aspect ratio, never upscaling), and returns a compact PNG data URL. Keeps
 * uploaded images small enough to live happily in a payload/localStorage
 * without a real object-storage backend.
 */
function fileToDataUrl(file: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode-failed'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas-unsupported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function fileToLogoDataUrl(file: File): Promise<string> {
  return fileToDataUrl(file, LOGO_MAX_DIMENSION);
}

export function fileToAvatarDataUrl(file: File): Promise<string> {
  return fileToDataUrl(file, AVATAR_MAX_DIMENSION);
}
