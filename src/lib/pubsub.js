import Redis from 'ioredis';

const CHANNEL = 'vanity:new';

const pub = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

let sub = null;
const listeners = [];

/**
 * Notify hit detector that a new vanity address was added
 */
export async function notifyNewVanity(vanityAddress) {
  await pub.publish(CHANNEL, vanityAddress.toLowerCase());
}

/**
 * Subscribe to new vanity address notifications
 * @param {function} callback - called with vanityAddress
 */
export async function onNewVanity(callback) {
  if (!sub) {
    sub = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    await sub.subscribe(CHANNEL);
    sub.on('message', (channel, message) => {
      if (channel === CHANNEL) {
        for (const fn of listeners) fn(message);
      }
    });
  }
  listeners.push(callback);
}
