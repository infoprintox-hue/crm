import { v2 as cloudinary } from 'cloudinary';
import { readSession } from '@/lib/server/auth';
import { friendlyError } from '@/lib/server/db';
import { json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await readSession(request);
  if (!user) return json({ error: 'Please login again' }, 401);
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return json({ error: 'Cloudinary is not configured' }, 501);
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) return json({ error: 'Upload a PNG, JPG, WEBP or PDF file' }, 400);
    if (file.size > 10 * 1024 * 1024) return json({ error: 'File too large (max 10MB)' }, 400);
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: process.env.CLOUDINARY_FOLDER || 'visitinglink/profiles', resource_type: 'auto' }, (error, result) => error ? reject(error) : resolve(result));
      stream.end(buffer);
    });
    return json({ ok: true, url: uploaded.secure_url || uploaded.url });
  } catch (error) {
    return json({ error: friendlyError(error) }, 500);
  }
}
