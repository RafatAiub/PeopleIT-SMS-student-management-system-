/**
 * Smart Client-Side Image Compression Utility
 * Resizes and compresses image files directly in the browser before upload.
 * Reduces 5MB+ images down to ~12KB - 30KB WebP/JPEG binaries for zero server strain.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  format?: 'image/webp' | 'image/jpeg' | 'image/png';
}

export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<{ dataUrl: string; blob: Blob; sizeKb: number }> {
  const {
    maxWidth = 350,
    maxHeight = 350,
    quality = 0.82,
    format = 'image/webp',
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect-ratio scale
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context creation failed'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Format export with WebP support
        let targetFormat = format;
        let dataUrl = canvas.toDataURL(targetFormat, quality);

        if (!dataUrl.startsWith(`data:${targetFormat}`)) {
          targetFormat = 'image/jpeg';
          dataUrl = canvas.toDataURL(targetFormat, quality);
        }

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const sizeKb = Math.round((blob.size / 1024) * 10) / 10;
              resolve({ dataUrl, blob, sizeKb });
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          targetFormat,
          quality
        );
      };

      img.onerror = () => reject(new Error('Invalid image file format'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
