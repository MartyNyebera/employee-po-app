// Turn a chosen image File into a small square thumbnail as a JPEG data URL, entirely in the
// browser (no upload library, no server-side image processing). Used for employee attendance
// photos: the result is stored in persons.photo_url — the same base64 data-URL convention the
// app already uses for signatures — so it stays light (~20-50KB) and renders anywhere, including
// the clock-station flash. Cover-crops to a centered square so faces aren't distorted.
const MAX_SOURCE_BYTES = 2 * 1024 * 1024; // reject sources over ~2MB before processing

export async function fileToSquareThumb(file: File, size = 300, quality = 0.8): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG, WEBP).');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Image is too large — please choose one under 2 MB.');

  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image on this device.');

  // Cover-crop: scale so the shorter side fills the square, then centre the overflow.
  const scale = Math.max(size / img.width, size / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);

  return canvas.toDataURL('image/jpeg', quality);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image — try a different file.')); };
    img.src = url;
  });
}
