import imageCompression from 'browser-image-compression';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Resize and compress an image so its longest side is at most maxDimensionPx.
 * Non-image files (e.g. PDF) are returned unchanged.
 * Helps avoid 413 Payload Too Large when uploading camera photos.
 */
export async function compressImageForUpload(
  file: File,
  maxDimensionPx: number = 1500
): Promise<File> {
  if (!IMAGE_MIMES.includes((file.type || '').toLowerCase())) {
    return file;
  }
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: maxDimensionPx,
    useWebWorker: true,
    initialQuality: 0.85,
  });
  
  // Ensure the compressed file retains the original file name so the backend accepts it
  return new File([compressed], file.name, {
    type: compressed.type || file.type,
    lastModified: file.lastModified,
  });
}
