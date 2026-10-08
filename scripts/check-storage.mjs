import { database, readState } from '../lib/server/db.js';

try {
  const { db } = await database();
  const record = await readState();
  console.log(`MongoDB connected: ${db.databaseName}`);
  console.log(`Business state revision: ${Number(record.revision || 0)}`);
  process.exit(0);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
