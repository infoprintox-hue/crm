import { setAdminPassword } from '../lib/server/auth.js';

const flagIndex = process.argv.indexOf('--password');
const password = flagIndex >= 0 ? process.argv[flagIndex + 1] : process.env.ADMIN_PASSWORD;
if (!password) {
  console.error('Pass --password "your-password" or set ADMIN_PASSWORD.');
  process.exit(1);
}

try {
  await setAdminPassword(password, 'seed script', false);
  console.log('Admin password saved in MongoDB.');
  process.exit(0);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
