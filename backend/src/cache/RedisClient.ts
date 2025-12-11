import { createClient, RedisClientType } from 'redis';

export class RedisClient {
    private client: RedisClientType;
    private connected: boolean = false;

    constructor() {
        this.client = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        return new Error('Redis connection failed after 10 retries');
                    }
                    return Math.min(retries * 100, 3000);
                },
            },
        });

        this.client.on('error', (err) => {
            console.error('Redis Client Error:', err);
        });

        this.client.on('connect', () => {
            console.log('Redis connected');
            this.connected = true;
        });
    }

    /**
     * Connect to Redis
     */
    async connect(): Promise<void> {
        if (!this.connected) {
            await this.client.connect();
        }
    }

    /**
     * Get cached thumbnail
     */
    async getThumbnail(imageId: string): Promise<Buffer | null> {
        const key = `thumb:${imageId}`;
        const data = await this.client.get(key);
        return data ? Buffer.from(data, 'base64') : null;
    }

    /**
     * Cache thumbnail with 1h TTL
     */
    async setThumbnail(imageId: string, data: Buffer): Promise<void> {
        const key = `thumb:${imageId}`;
        await this.client.setEx(key, 3600, data.toString('base64'));
    }

    /**
     * Invalidate thumbnail cache
     */
    async invalidateThumbnail(imageId: string): Promise<void> {
        const key = `thumb:${imageId}`;
        await this.client.del(key);
    }

    /**
     * Invalidate all thumbnails for a pattern
     */
    async invalidatePattern(pattern: string): Promise<void> {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
            await this.client.del(keys);
        }
    }

    /**
     * Acquire distributed lock using SETNX
     * Returns true if lock acquired, false otherwise
     */
    async acquireLock(key: string, ttlSeconds: number = 30): Promise<boolean> {
        const lockKey = `lock:${key}`;
        const result = await this.client.set(lockKey, '1', {
            NX: true,
            EX: ttlSeconds,
        });
        return result === 'OK';
    }

    /**
     * Release distributed lock
     */
    async releaseLock(key: string): Promise<void> {
        const lockKey = `lock:${key}`;
        await this.client.del(lockKey);
    }

    /**
     * Execute operation with distributed lock
     */
    async withLock<T>(
        key: string,
        callback: () => Promise<T>,
        ttlSeconds: number = 30
    ): Promise<T> {
        const acquired = await this.acquireLock(key, ttlSeconds);
        if (!acquired) {
            throw new Error(`Failed to acquire lock: ${key}`);
        }

        try {
            return await callback();
        } finally {
            await this.releaseLock(key);
        }
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{ hits: number; misses: number; hitRate: number }> {
        const info = await this.client.info('stats');
        const hits = parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0');
        const misses = parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] || '0');
        const total = hits + misses;
        const hitRate = total > 0 ? hits / total : 0;
        return { hits, misses, hitRate };
    }

    /**
     * Close Redis connection
     */
    async close(): Promise<void> {
        await this.client.quit();
        this.connected = false;
    }
}
