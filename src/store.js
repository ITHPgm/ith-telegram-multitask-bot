import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Redis } from '@upstash/redis';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localFile = process.env.VERCEL
  ? path.join(tmpdir(), 'telegram-multitask-bot-store.json')
  : path.resolve(__dirname, '../data/store.json');
const redis = config.redisUrl && config.redisToken
  ? new Redis({ url: config.redisUrl, token: config.redisToken })
  : null;

let memoryCache;
let writeQueue = Promise.resolve();

async function readLocal() {
  if (memoryCache) return memoryCache;
  try {
    const raw = await readFile(localFile, 'utf8');
    memoryCache = JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    memoryCache = { users: {}, usage: {}, payments: {} };
  }
  return memoryCache;
}

async function saveLocal(state) {
  memoryCache = state;
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(localFile), { recursive: true });
    await writeFile(localFile, JSON.stringify(state, null, 2), 'utf8');
  });
  await writeQueue;
}

export const storageMode = redis ? 'upstash-redis' : 'local-json';

export async function getUser(userId) {
  const id = String(userId);
  if (redis) return (await redis.get(`ithbot:user:${id}`)) || null;
  const state = await readLocal();
  return state.users[id] || null;
}

export async function saveUser(userId, patch) {
  const id = String(userId);
  const previous = await getUser(id) || {};
  const user = { ...previous, ...patch, id };
  if (redis) {
    await redis.set(`ithbot:user:${id}`, user);
    await redis.sadd('ithbot:user_ids', id);
    return user;
  }
  const state = await readLocal();
  state.users[id] = user;
  await saveLocal(state);
  return user;
}

export async function getUsers() {
  if (redis) {
    const ids = await redis.smembers('ithbot:user_ids');
    const users = await Promise.all(ids.map(id => redis.get(`ithbot:user:${id}`)));
    return users.filter(Boolean);
  }
  const state = await readLocal();
  return Object.values(state.users);
}

export async function incrementUsage(userId, bucket) {
  const id = String(userId);
  const key = `ithbot:usage:${id}:${bucket}`;
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60 * 60 * 48);
    return count;
  }
  const state = await readLocal();
  state.usage[key] = (state.usage[key] || 0) + 1;
  await saveLocal(state);
  return state.usage[key];
}

export async function hasPaymentBeenRecorded(chargeId) {
  if (redis) return Boolean(await redis.get(`ithbot:payment:${chargeId}`));
  const state = await readLocal();
  return Boolean(state.payments[chargeId]);
}

export async function recordPayment(chargeId, details) {
  if (redis) {
    const result = await redis.set(`ithbot:payment:${chargeId}`, details, { nx: true });
    return result === 'OK';
  }
  const state = await readLocal();
  if (state.payments[chargeId]) return false;
  state.payments[chargeId] = details;
  await saveLocal(state);
  return true;
}
