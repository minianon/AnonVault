import { useState } from 'react';
import { uploadImage } from '../services/images';

/** Upload state for ImagesEditor. Returns [uploading, addFiles, onPaste]. */
export function useImageUpload(setImages, showToast) {
  const [uploading, setUploading] = useState(0);
  const addFiles = async files => {
    const list = [...(files || [])].filter(f => f.type?.startsWith('image/'));
    if (!list.length) return;
    setUploading(n => n + list.length);
    for (const f of list) {
      try { const url = await uploadImage(f); setImages(im => [...im, url]); }
      catch (err) { showToast?.('error', 'Image not added', err?.message || 'Upload failed'); }
      finally { setUploading(n => n - 1); }
    }
  };
  const onPaste = e => {
    const imgs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); addFiles(imgs); }
  };
  return [uploading, addFiles, onPaste];
}
