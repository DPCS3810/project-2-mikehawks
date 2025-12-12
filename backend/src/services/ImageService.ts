import { Readable } from 'stream';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { PostgresClient, ImageRecord } from '../database/PostgresClient';
import { CloudStorage } from '../storage/CloudStorage';
import { RedisClient } from '../cache/RedisClient';
import * as fs from 'fs/promises';
import * as path from 'path';

const LOCAL_STORAGE_DIR = path.join(__dirname, '../../local-storage');
const USE_LOCAL_STORAGE = !process.env.GCP_PROJECT_ID;

export class ImageService {
    constructor(
        private db: PostgresClient,
        private storage: CloudStorage,
        private cache: RedisClient
    ) {
        // Create local storage directories if using local storage
        if (USE_LOCAL_STORAGE) {
            this.initLocalStorage();
        }
    }

    private async initLocalStorage() {
        try {
            await fs.mkdir(path.join(LOCAL_STORAGE_DIR, 'raw'), { recursive: true });
            await fs.mkdir(path.join(LOCAL_STORAGE_DIR, 'results'), { recursive: true });
            await fs.mkdir(path.join(LOCAL_STORAGE_DIR, 'thumb'), { recursive: true });
        } catch (error) {
            console.warn('Could not create local storage directories:', error);
        }
    }

    /**
     * Upload a new image
     */
    async upload(
        stream: Readable,
        userId: string,
        mimeType: string,
        sizeBytes: number
    ): Promise<{ image: ImageRecord; thumbnailUrl: string }> {
        // Stateless mode: Force 'demo' user to ensure consistent paths without DB
        if (process.env.SKIP_DB_CHECK === 'true') {
            userId = 'demo';
        }

        // Validate file size
        if (sizeBytes > 10 * 1024 * 1024) {
            throw new Error('Image too large (max 10 MB)');
        }

        // Validate MIME type
        if (!['image/jpeg', 'image/png'].includes(mimeType)) {
            throw new Error('Only JPG and PNG allowed');
        }

        const imageId = uuidv4();

        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        let storagePath: string;

        if (USE_LOCAL_STORAGE) {
            // Store locally
            const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
            storagePath = `local/${userId}/${imageId}.${ext}`;
            const localPath = path.join(LOCAL_STORAGE_DIR, 'raw', `${imageId}.${ext}`);
            await fs.writeFile(localPath, buffer);
        } else {
            // Upload to Cloud Storage
            const bufferStream = Readable.from(buffer);
            storagePath = await this.storage.uploadRaw(userId, imageId, bufferStream, mimeType);
        }

        // Create database record
        let image: ImageRecord;
        if (process.env.SKIP_DB_CHECK === 'true') {
            image = {
                id: imageId,
                user_id: userId,
                original_path: storagePath,
                size_bytes: sizeBytes,
                mime_type: mimeType,
                created_at: new Date(),
                updated_at: new Date()
            };
        } else {
            image = await this.db.createImage(userId, storagePath, sizeBytes, mimeType);
        }

        // Generate thumbnail asynchronously
        const thumbnailUrl = await this.generateThumbnail(image.id, storagePath, buffer);

        return { image, thumbnailUrl };
    }

    /**
     * Generate 400px WebP thumbnail
     */
    async generateThumbnail(imageId: string, storagePath: string, buffer?: Buffer): Promise<string> {
        // Skip caching if DB check is skipped to avoid Redis errors
        if (process.env.SKIP_DB_CHECK === 'true') {
            // Generate thumbnail
            if (!buffer) {
                buffer = await this.storage.download('raw', storagePath);
            }
            const thumbnail = await sharp(buffer)
                .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer();

            await this.storage.uploadThumbnail(imageId, thumbnail);
            return this.storage.getSignedUrl('thumb', `${imageId}.webp`);
        }

        // Check cache first
        const cached = await this.cache.getThumbnail(imageId);
        if (cached) {
            if (USE_LOCAL_STORAGE) {
                return `/api/v1/images/${imageId}/thumbnail`;
            }
            return this.storage.getSignedUrl('thumb', `${imageId}.webp`);
        }

        // Download original if buffer not provided
        if (!buffer) {
            if (USE_LOCAL_STORAGE) {
                const localPath = path.join(LOCAL_STORAGE_DIR, 'raw', path.basename(storagePath));
                buffer = await fs.readFile(localPath);
            } else {
                buffer = await this.storage.download('raw', storagePath);
            }
        }

        // Generate thumbnail
        const thumbnail = await sharp(buffer)
            .resize(400, 400, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toBuffer();

        if (USE_LOCAL_STORAGE) {
            // Save locally
            const localPath = path.join(LOCAL_STORAGE_DIR, 'thumb', `${imageId}.webp`);
            await fs.writeFile(localPath, thumbnail);
        } else {
            // Upload to storage
            await this.storage.uploadThumbnail(imageId, thumbnail);
        }

        // Cache in Redis
        await this.cache.setThumbnail(imageId, thumbnail);

        // Return URL
        if (USE_LOCAL_STORAGE) {
            return `/api/v1/images/${imageId}/thumbnail`;
        }
        return this.storage.getSignedUrl('thumb', `${imageId}.webp`);
    }

    /**
     * Get image metadata
     */
    async getMetadata(imageId: string): Promise<ImageRecord | null> {
        if (process.env.SKIP_DB_CHECK === 'true') {
            // Return dummy metadata to allow frontend to proceed
            return {
                id: imageId,
                user_id: 'demo-user',
                original_path: `${imageId}.jpg`, // enhanced guess
                size_bytes: 0,
                mime_type: 'image/jpeg',
                created_at: new Date(),
                updated_at: new Date()
            };
        }
        return this.db.getImage(imageId);
    }

    /**
     * Delete image and all associated data
     */
    async delete(imageId: string): Promise<void> {
        const image = await this.db.getImage(imageId);
        if (!image) {
            throw new Error('Image not found');
        }

        if (USE_LOCAL_STORAGE) {
            // Delete local files
            try {
                const rawPath = path.join(LOCAL_STORAGE_DIR, 'raw', path.basename(image.original_path));
                await fs.unlink(rawPath).catch(() => { });

                const thumbPath = path.join(LOCAL_STORAGE_DIR, 'thumb', `${imageId}.webp`);
                await fs.unlink(thumbPath).catch(() => { });
            } catch (error) {
                console.warn('Error deleting local files:', error);
            }
        } else {
            // Delete from storage
            await this.storage.deleteAllForImage(imageId);
            await this.storage.delete('raw', image.original_path);
        }

        // Invalidate cache
        await this.cache.invalidateThumbnail(imageId);

        // Delete from database
        await this.db.deleteImage(imageId);
    }

    /**
     * Get signed URL for download
     */
    async getDownloadUrl(
        imageId: string,
        revisionId?: string
    ): Promise<{ url: string; mimeType: string }> {
        const image = await this.db.getImage(imageId);
        if (!image) {
            throw new Error('Image not found');
        }

        let path: string;
        let bucketType: 'raw' | 'results';

        if (revisionId) {
            const revision = await this.db.getRevision(revisionId);
            if (!revision || revision.image_id !== imageId) {
                throw new Error('Revision not found');
            }
            path = revision.storage_path;
            bucketType = 'results';
        } else {
            path = image.original_path;
            bucketType = 'raw';
        }

        if (USE_LOCAL_STORAGE) {
            // Return local API endpoint
            return {
                url: `/api/v1/images/${imageId}/download${revisionId ? `?revision=${revisionId}` : ''}`,
                mimeType: image.mime_type,
            };
        }

        const url = await this.storage.getSignedUrl(bucketType, path);
        return { url, mimeType: image.mime_type };
    }

    /**
     * Get local file (for local development)
     */
    async getLocalFile(imageId: string, type: 'raw' | 'results' | 'thumb', filename: string): Promise<Buffer> {
        const localPath = path.join(LOCAL_STORAGE_DIR, type, filename);
        return fs.readFile(localPath);
    }

    /**
     * List all images for a user
     */
    async listByUser(userId: string): Promise<ImageRecord[]> {
        return [];
    }
}
