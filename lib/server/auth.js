import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { APP_ID, database } from './db.js';

const AUTH_KEY = 'owner-admin';
const COOKIE = 'vl_business_session';
const KEY_LENGTH = 64;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionSecret() {
  return String(process.env.SESSION_SECRET || '').trim() || 'visitinglink-local-development-secret';
}

async function authRecord() {
  const { auth } = await database();
  return await auth.findOne({ appId: APP_ID, key: AUTH_KEY }) || { sessionEpoch: 0 };
}

export function hashPin(pin) {
  return createHash('sha256').update(String(pin || '')).digest('hex');
}

export async function verifyAdminPassword(password) {
  const record = await authRecord();
  if (record.passwordHash && record.passwordSalt) {
    const actual = scryptSync(String(password), record.passwordSalt, KEY_LENGTH);
    const expected = Buffer.from(record.passwordHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  const configured = String(process.env.ADMIN_PASSWORD || '').trim();
  return Boolean(configured) && safeEqual(configured, password);
}

export async function setAdminPassword(password, editor, bump = true) {
  const value = String(password || '').trim();
  if (value.length < 8) throw new Error('Admin password must be at least 8 characters');
  const current = await authRecord();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(value, salt, KEY_LENGTH).toString('hex');
  const sessionEpoch = Number(current.sessionEpoch || 0) + (bump ? 1 : 0);
  const { auth } = await database();
  await auth.updateOne(
    { appId: APP_ID, key: AUTH_KEY },
    { $set: { passwordHash, passwordSalt: salt, sessionEpoch, updatedAt: new Date().toISOString(), updatedBy: editor }, $setOnInsert: { appId: APP_ID, key: AUTH_KEY } },
    { upsert: true },
  );
  return sessionEpoch;
}

export async function bumpSessions(editor) {
  const current = await authRecord();
  const sessionEpoch = Number(current.sessionEpoch || 0) + 1;
  const { auth } = await database();
  await auth.updateOne(
    { appId: APP_ID, key: AUTH_KEY },
    { $set: { sessionEpoch, updatedAt: new Date().toISOString(), updatedBy: editor }, $setOnInsert: { appId: APP_ID, key: AUTH_KEY } },
    { upsert: true },
  );
  return sessionEpoch;
}

export async function createSession(user) {
  const { sessionEpoch = 0 } = await authRecord();
  const payload = Buffer.from(JSON.stringify({ ...user, sessionEpoch, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export async function readSession(request) {
  const raw = String(request.headers.get('cookie') || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [payload, signature] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Number(user.exp || 0) < Date.now()) return null;
    const auth = await authRecord();
    if (Number(user.sessionEpoch || 0) !== Number(auth.sessionEpoch || 0)) return null;
    return user;
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
