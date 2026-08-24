// Direct browser-to-Cloudinary upload (unsigned preset) — large files (video
// in particular) never pass through our own backend, which caps JSON bodies
// at 10mb and would choke on anything bigger anyway. Requires
// VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to be set in
// frontend/.env; the preset must have Signing Mode set to "Unsigned" in the
// Cloudinary dashboard (Settings -> Upload -> Upload presets).

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super(
      'File uploads are not configured yet. Set VITE_CLOUDINARY_CLOUD_NAME and ' +
        'VITE_CLOUDINARY_UPLOAD_PRESET in frontend/.env (see README for setup steps).',
    );
    this.name = 'CloudinaryNotConfiguredError';
  }
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME && import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
}

export function uploadToCloudinary(file: File, onProgress?: (percent: number) => void): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    return Promise.reject(new CloudinaryNotConfiguredError());
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    const xhr = new XMLHttpRequest();
    // "auto" lets Cloudinary route the file to its image/video/raw pipeline
    // based on content, which is exactly the video/image/PDF mix this app needs.
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) {
          resolve(body.secure_url as string);
        } else {
          reject(new Error(body.error?.message || 'Upload failed'));
        }
      } catch {
        reject(new Error('Upload failed — unexpected response from storage provider'));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed — network error'));

    xhr.send(formData);
  });
}
