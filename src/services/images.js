/* ─────────────────────────────────────────────────────────
   images.js — attach an image to anything.

   Uploads to the Supabase `idea-images` bucket when it's configured.
   Without Supabase it falls back to a downscaled JPEG data URL so the
   feature still works offline (kept small: ~1000px, quality 0.72).
   ───────────────────────────────────────────────────────── */

import { uploadIdeaImage, getSupabaseClient } from './supabase';

const MAX_MB = 8;

function shrink(file, max = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
    img.src = url;
  });
}

export async function uploadImage(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Only images can be attached.');
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Images must be under ${MAX_MB} MB.`);
  if (getSupabaseClient()) {
    try { return await uploadIdeaImage(file); }
    catch (err) { console.warn('[images] upload failed, keeping a local copy:', err?.message || err); }
  }
  return shrink(file);
}
