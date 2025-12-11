import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface ImageRecord {
    id: string;
    user_id: string;
    original_path: string;
    size_bytes: number;
    mime_type: string;
    created_at: Date;
    updated_at: Date;
}

export interface RevisionRecord {
    id: string;
    image_id: string;
    parent_id: string | null;
    op_type: number;
    op_params: any;
    storage_path: string;
    created_at: Date;
}

export class PostgresClient {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432'),
            database: process.env.POSTGRES_DB || 'image_editor',
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || 'postgres',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
    }

    /**
     * Initialize database schema
     */
    async initialize(): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS images (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL,
          original_path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          mime_type VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS revisions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
          parent_id UUID REFERENCES revisions(id) ON DELETE SET NULL,
          op_type SMALLINT NOT NULL,
          op_params JSONB NOT NULL,
          storage_path TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_revisions_image_id ON revisions(image_id);
        CREATE INDEX IF NOT EXISTS idx_revisions_parent_id ON revisions(parent_id);
        CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
      `);
        } finally {
            client.release();
        }
    }

    /**
     * Create a new image record
     */
    async createImage(
        userId: string,
        originalPath: string,
        sizeBytes: number,
        mimeType: string
    ): Promise<ImageRecord> {
        const result = await this.pool.query(
            `INSERT INTO images (user_id, original_path, size_bytes, mime_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [userId, originalPath, sizeBytes, mimeType]
        );
        return result.rows[0];
    }

    /**
     * Get image by ID
     */
    async getImage(imageId: string, client?: PoolClient): Promise<ImageRecord | null> {
        const executor = client || this.pool;
        const result = await executor.query(
            'SELECT * FROM images WHERE id = $1',
            [imageId]
        );
        return result.rows[0] || null;
    }

    /**
     * Delete image (cascades to revisions)
     */
    async deleteImage(imageId: string): Promise<void> {
        await this.pool.query('DELETE FROM images WHERE id = $1', [imageId]);
    }

    /**
     * Create a new revision
     */
    async createRevision(
        imageId: string,
        parentId: string | null,
        opType: number,
        opParams: any,
        storagePath: string,
        client?: PoolClient
    ): Promise<RevisionRecord> {
        const executor = client || this.pool;
        const result = await executor.query(
            `INSERT INTO revisions (image_id, parent_id, op_type, op_params, storage_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [imageId, parentId, opType, JSON.stringify(opParams), storagePath]
        );
        return result.rows[0];
    }

    /**
     * Get latest revision for an image
     */
    async getLatestRevision(imageId: string, client?: PoolClient): Promise<RevisionRecord | null> {
        const executor = client || this.pool;
        const result = await executor.query(
            `SELECT * FROM revisions 
       WHERE image_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
            [imageId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get revision by ID
     */
    async getRevision(revisionId: string): Promise<RevisionRecord | null> {
        const result = await this.pool.query(
            'SELECT * FROM revisions WHERE id = $1',
            [revisionId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get all revisions for an image
     */
    async getRevisionHistory(imageId: string): Promise<RevisionRecord[]> {
        const result = await this.pool.query(
            `SELECT * FROM revisions 
       WHERE image_id = $1 
       ORDER BY created_at ASC`,
            [imageId]
        );
        return result.rows;
    }

    /**
     * Acquire row-level lock on image for concurrent operations
     */
    async withImageLock<T>(
        imageId: string,
        callback: (client: PoolClient) => Promise<T>
    ): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Row-level lock on the image record
            await client.query('SELECT * FROM images WHERE id = $1 FOR UPDATE', [imageId]);
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Close database connection pool
     */
    async close(): Promise<void> {
        await this.pool.end();
    }
}
