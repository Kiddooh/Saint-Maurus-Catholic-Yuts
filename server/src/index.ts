import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import { createServer } from 'node:http';
import { attachRealtime } from './realtime.js';
const port = Number(process.env.PORT || 4000);
const configuredPool = Number(process.env.MONGO_MAX_POOL_SIZE || 20);
if (!Number.isInteger(configuredPool) || configuredPool < 1 || configuredPool > 200) throw new Error('MONGO_MAX_POOL_SIZE must be an integer from 1 to 200.');
if (process.env.MONGODB_URI && (process.env.JWT_SECRET || '').length >= 32) {
  mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, maxPoolSize: configuredPool, waitQueueTimeoutMS: 10000 }).then(() => console.log('Database connected')).catch(() => console.error(JSON.stringify({level:'error',event:'database_connection_failed'})));
} else console.warn('MongoDB URI and a JWT_SECRET of at least 32 characters are required; API will report configuration required.');
const server=createServer(app);
attachRealtime(server);
server.listen(port, '0.0.0.0', () => console.log(`API listening on ${port}`));
