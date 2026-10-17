import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function isAdminAuthenticated() {
  const token = (await cookies())
    .get('vl_admin_session')?.value;

  const sessionSecret = process.env.SESSION_SECRET;

  if (!token || !sessionSecret) {
    return false;
  }

  try {
    const secret = new TextEncoder().encode(sessionSecret);

    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256']
    });

    return payload.role === 'admin';
  } catch {
    return false;
  }
}