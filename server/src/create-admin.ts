import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './models.js';
import { z } from 'zod';
async function main() {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 72) throw new Error('Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (12–72 characters).');
  z.string().trim().min(2).max(100).parse(ADMIN_NAME);
  z.string().trim().email().max(254).parse(ADMIN_EMAIL);
  if (Buffer.byteLength(ADMIN_PASSWORD, 'utf8') > 72) throw new Error('ADMIN_PASSWORD must be at most 72 UTF-8 bytes.');
  await mongoose.connect(MONGODB_URI);
  if (await User.exists({ role: 'admin' })) throw new Error('An administrator already exists. Bootstrap is only for the first administrator.');
  if (await User.exists({ email: ADMIN_EMAIL.toLowerCase().trim() })) throw new Error('Email already belongs to an account. Choose an unused email.');
  await User.create({ name: ADMIN_NAME.trim(), email: ADMIN_EMAIL.toLowerCase().trim(), passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'admin' });
  console.log('Initial administrator created. Remove bootstrap credentials from your environment.');
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
