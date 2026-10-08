import { MongoClient } from 'mongodb';
import { serverLog } from './logger.js';

export const APP_ID = 'visitinglink-business-os';

const globalCache = globalThis;

function mongoUri() {
  return String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
}

function databaseName() {
  const configured = String(process.env.MONGODB_DB || process.env.MONGO_DB || '').trim();
  if (configured) return configured;
  try {
    return new URL(mongoUri()).pathname.replace(/^\//, '') || 'visitinglink';
  } catch {
    return 'visitinglink';
  }
}

export async function database() {
  const uri = mongoUri();
  if (!uri) {
    serverLog('error', 'database.configuration_missing', { variable: 'MONGODB_URI', message: 'MongoDB is not configured. Add MONGODB_URI to .env.local.' });
    throw new Error('MONGODB_URI is missing');
  }

  if (!globalCache.__visitinglinkMongo) {
    const startedAt = Date.now();
    serverLog('info', 'database.connecting', { database: databaseName(), message: 'Connecting to MongoDB…' });
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      family: 4,
    });
    globalCache.__visitinglinkMongo = client.connect()
      .then(connected => {
        serverLog('info', 'database.connected', { database: databaseName(), durationMs: Date.now() - startedAt, message: 'MongoDB connected successfully.' });
        return connected;
      })
      .catch(error => {
        globalCache.__visitinglinkMongo = null;
        serverLog('error', 'database.connection_failed', { database: databaseName(), durationMs: Date.now() - startedAt, error, message: 'MongoDB connection failed. Check MONGODB_URI and Atlas Network Access.' });
        throw error;
      });
  }

  const client = await globalCache.__visitinglinkMongo;
  const db = client.db(databaseName());
  const state = db.collection('business_state');
  const activity = db.collection('business_activity');
  const auth = db.collection('auth_settings');

  if (!globalCache.__visitinglinkIndexes) {
    globalCache.__visitinglinkIndexes = Promise.all([
      state.createIndex({ appId: 1 }, { unique: true }),
      activity.createIndex({ appId: 1, createdAt: -1 }),
      auth.createIndex({ appId: 1, key: 1 }, { unique: true }),
    ]).catch(error => {
      serverLog('warn', 'database.index_setup_failed', { error });
      return undefined;
    });
  }
  await globalCache.__visitinglinkIndexes;
  return { db, state, activity, auth };
}

export function blankState() {
  return {
    team: [], leads: [], tasks: [], finance: [], importHistory: [], reminders: [],
    leadTrash: [], profile: { photo: '', name: '' }, documents: [], billingProfile: {},
  };
}

export async function readState() {
  const { state } = await database();
  const record = await state.findOne({ appId: APP_ID });
  return record || { appId: APP_ID, payload: blankState(), revision: 0, updatedAt: null, updatedBy: null };
}

export async function writeState(payload, revision, editor) {
  const { state } = await database();
  const updatedAt = new Date().toISOString();
  const expected = Number(revision || 0);
  if (!expected) {
    try {
      await state.insertOne({ appId: APP_ID, payload, revision: 1, updatedAt, updatedBy: editor });
      return { revision: 1, updatedAt };
    } catch (error) {
      if (error?.code === 11000) return null;
      throw error;
    }
  }
  const result = await state.findOneAndUpdate(
    { appId: APP_ID, revision: expected },
    { $set: { payload, revision: expected + 1, updatedAt, updatedBy: editor } },
    { returnDocument: 'after' },
  );
  const record = result?.value || result;
  return Number(record?.revision) === expected + 1 ? { revision: expected + 1, updatedAt } : null;
}

export async function mutateState(editor, updater) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const record = await readState();
    const current = structuredClone(record.payload || blankState());
    const result = await updater(current);
    if (result?.error) return result;
    const payload = result?.state || current;
    const saved = await writeState(payload, record.revision, editor);
    if (saved) return { ok: true, state: payload, ...saved, ...(result?.response || {}) };
  }
  return { error: 'Data changed at the same time. Please retry.', status: 409 };
}

export async function logActivity(action, editor, detail = {}) {
  try {
    const { activity } = await database();
    await activity.insertOne({ appId: APP_ID, action, editor, detail, createdAt: new Date().toISOString() });
  } catch (error) {
    serverLog('error', 'activity.write_failed', { action, editor, error });
  }
}

export async function listActivity(limit = 500) {
  const { activity } = await database();
  return activity.find({ appId: APP_ID }).sort({ createdAt: -1 }).limit(Math.min(1000, Number(limit) || 500)).toArray();
}

export async function revealedLeadIdsToday(memberId, since) {
  const { activity } = await database();
  return activity.distinct('detail.leadId', {
    appId: APP_ID,
    action: { $in: ['lead_phone_reveal', 'lead_phone_copy', 'lead_phone_call', 'lead_phone_whatsapp'] },
    'detail.memberId': String(memberId || ''),
    createdAt: { $gte: String(since || '') },
  });
}

export function friendlyError(error) {
  const message = String(error?.message || error || 'Server error');
  if (/MONGODB_URI is missing/i.test(message)) return 'MongoDB is not configured. Add MONGODB_URI to .env.local.';
  if (/authentication failed|bad auth/i.test(message)) return 'MongoDB login failed. Check MONGODB_URI.';
  if (/ENOTFOUND|ECONNREFUSED|ServerSelection|ReplicaSetNoPrimary|TLS/i.test(message)) return 'MongoDB connection failed. Check Atlas Network Access and MONGODB_URI.';
  return message;
}
