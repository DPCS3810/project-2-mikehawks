import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { PostgresClient, RevisionRecord } from '../database/PostgresClient';
import { CloudStorage } from '../storage/CloudStorage';
import { RedisClient } from '../cache/RedisClient';
import { Operation } from '../operations/Operation';
import * as fs from 'fs/promises';
import * as path from 'path';

const LOCAL_STORAGE_DIR = path.join(__dirname, '../../local-storage');
const USE_LOCAL_STORAGE = !process.env.GCP_PROJECT_ID;

export class RevisionService {
    private statelessPathCache = new Map<string, string>();

    constructor(
        private db: PostgresClient,
        private storage: CloudStorage,
        private cache: RedisClient
    ) { }

    /**
     * Apply an operation to create a new revision
     */
    async applyOp(imageId: string, operation: Operation): Promise<RevisionRecord> {
        // Validate operation
        if (!operation.validate()) {
            throw new Error('Invalid operation parameters');
        }

        if (process.env.SKIP_DB_CHECK === 'true') {
            // Stateless mode: Skip DB lock and record creation
            // We can't really track parent/history in this mode easily without passing it in, 
            // so we'll just assume we're always working on the "latest" being the original or previous result key if we had one.
            // For simplicity in this demo mode, we'll download the ORIGINAL (or we'd need the client to pass current path).
            // Let's assume we always transform the ORIGINAL for now in stateless mode (limitation) 
            // OR we rely on the specific imageId existing in storage.

            // Download source (assuming raw original for stateless simplicity or implementing a smart guess)
            // A better stateless approach would be: Client sends "sourceUrl" ? No, security.
            // Let's just download the raw image associated with imageId.
            // In stateless mode, we force user='demo' so check there.
            const sourcePath = `demo/${imageId}.jpg`;

            let sourceBuffer: Buffer;
            try {
                sourceBuffer = await this.storage.download('raw', sourcePath); // Try raw
            } catch (e) {
                // Try png
                try {
                    sourceBuffer = await this.storage.download('raw', `demo/${imageId}.png`);
                } catch (e2) {
                    // Try to find ANY match - tough without DB. 
                    // Let's rely on ImageService "getMetadata" mock which returned jpg.
                    sourceBuffer = await this.storage.download('raw', `demo/${imageId}.jpg`);
                }
            }

            // Apply operation
            let pipeline = sharp(sourceBuffer);
            pipeline = operation.toSharp(pipeline);
            const resultBuffer = await pipeline.toBuffer();

            // Upload Result
            const revisionId = uuidv4();
            const resultPath = await this.storage.uploadResult(
                imageId,
                revisionId,
                resultBuffer,
                'image/jpeg' // Default
            );

            // Cache for stateless getDownloadUrl lookup
            this.statelessPathCache.set(revisionId, resultPath);

            // Mock Revision Record
            return {
                id: revisionId,
                image_id: imageId,
                parent_id: null,
                op_type: operation.type,
                op_params: operation.params,
                storage_path: resultPath,
                created_at: new Date()
            };
        }

        // Use database row-level lock
        return this.db.withImageLock(imageId, async (client) => {
            // ... (existing DB code) ...

            // Get image metadata
            const image = await this.db.getImage(imageId, client);
            if (!image) {
                throw new Error('Image not found');
            }

            // Get latest revision or use original
            const parent = await this.db.getLatestRevision(imageId, client);
            const sourcePath = parent ? parent.storage_path : image.original_path;
            const sourceBucket = parent ? 'results' : 'raw';

            // Download source image
            let sourceBuffer: Buffer;
            if (USE_LOCAL_STORAGE) {
                const localPath = path.join(LOCAL_STORAGE_DIR, sourceBucket, path.basename(sourcePath));
                sourceBuffer = await fs.readFile(localPath);
            } else {
                sourceBuffer = await this.storage.download(sourceBucket as any, sourcePath);
            }

            // Apply operation using Sharp
            let pipeline = sharp(sourceBuffer);
            pipeline = operation.toSharp(pipeline);

            // Execute pipeline
            const resultBuffer = await pipeline.toBuffer();

            // Generate revision ID and storage path
            const revisionId = uuidv4();
            let resultPath: string;

            if (USE_LOCAL_STORAGE) {
                const ext = image.mime_type === 'image/jpeg' ? 'jpg' : 'png';
                resultPath = `local/${imageId}_${revisionId}.${ext}`;
                const localPath = path.join(LOCAL_STORAGE_DIR, 'results', `${imageId}_${revisionId}.${ext}`);
                await fs.writeFile(localPath, resultBuffer);
            } else {
                resultPath = await this.storage.uploadResult(
                    imageId,
                    revisionId,
                    resultBuffer,
                    image.mime_type
                );
            }

            // Create revision record
            const revision = await this.db.createRevision(
                imageId,
                parent?.id || null,
                operation.type,
                operation.params,
                resultPath,
                client
            );

            // Invalidate thumbnail cache
            await this.cache.invalidateThumbnail(imageId);

            return revision;
        });
    }

    /**
     * Undo last operation
     */
    async undo(imageId: string): Promise<RevisionRecord> {
        const current = await this.db.getLatestRevision(imageId);
        if (!current) {
            throw new Error('No revisions to undo');
        }

        if (!current.parent_id) {
            throw new Error('Cannot undo original image');
        }

        const parent = await this.db.getRevision(current.parent_id);
        if (!parent) {
            throw new Error('Parent revision not found');
        }

        // Invalidate thumbnail cache
        await this.cache.invalidateThumbnail(imageId);

        return parent;
    }

    /**
     * Get revision history for an image
     */
    async getHistory(imageId: string): Promise<RevisionRecord[]> {
        return this.db.getRevisionHistory(imageId);
    }

    /**
     * Get specific revision
     */
    /**
     * Get specific revision
     */
    async getRevision(revisionId: string): Promise<RevisionRecord | null> {
        if (process.env.SKIP_DB_CHECK === 'true') {
            return null; // Can't retrieve without DB
        }
        return this.db.getRevision(revisionId);
    }

    /**
     * Get latest revision
     */
    async getLatest(imageId: string): Promise<RevisionRecord | null> {
        if (process.env.SKIP_DB_CHECK === 'true') {
            return null; // Can't retrieve without DB
        }
        return this.db.getLatestRevision(imageId);
    }

    // ...

    /**
     * Get download URL for a specific revision
     */
    async getDownloadUrl(revisionId: string): Promise<string> {
        if (process.env.SKIP_DB_CHECK === 'true') {
            const path = this.statelessPathCache.get(revisionId);
            if (!path) {
                // Determine if we can reconstruct it from pattern if cache miss
                throw new Error("Revision path not found in cache (stateless mode)");
            }
            return this.storage.getSignedUrl('results', path);
        }
        const revision = await this.db.getRevision(revisionId);
        if (!revision) {
            throw new Error('Revision not found');
        }

        if (USE_LOCAL_STORAGE) {
            return `/api/v1/revisions/${revisionId}/download`;
        }
        return this.storage.getSignedUrl('results', revision.storage_path);
    }
}
