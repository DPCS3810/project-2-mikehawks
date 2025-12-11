import { Storage, Bucket, File } from '@google-cloud/storage';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

export class CloudStorage {
    private storage: Storage;
    private rawBucket: Bucket;
    private resultsBucket: Bucket;
    private thumbBucket: Bucket;

    constructor() {
        // Only initialize if GCP credentials are provided
        if (process.env.GCP_PROJECT_ID && process.env.GCP_KEY_FILE) {
            this.storage = new Storage({
                projectId: process.env.GCP_PROJECT_ID,
                keyFilename: process.env.GCP_KEY_FILE,
            });
        } else {
            // For local development without GCP
            console.warn('⚠️  GCP credentials not configured. Cloud Storage features will be limited.');
            this.storage = new Storage();
        }

        const bucketPrefix = process.env.GCS_BUCKET_PREFIX || 'image-editor';
        this.rawBucket = this.storage.bucket(`${bucketPrefix}-raw`);
        this.resultsBucket = this.storage.bucket(`${bucketPrefix}-results`);
        this.thumbBucket = this.storage.bucket(`${bucketPrefix}-thumb`);
    }

    /**
     * Initialize buckets with lifecycle policies
     */
    async initialize(): Promise<void> {
        const buckets = [
            { bucket: this.rawBucket, name: 'raw' },
            { bucket: this.resultsBucket, name: 'results' },
            { bucket: this.thumbBucket, name: 'thumb' },
        ];

        for (const { bucket, name } of buckets) {
            const [exists] = await bucket.exists();
            if (!exists) {
                await bucket.create();
                console.log(`Created bucket: ${name}`);
            }

            // Set lifecycle policy: delete after 24 hours
            await bucket.setMetadata({
                lifecycle: {
                    rule: [
                        {
                            action: { type: 'Delete' },
                            condition: { age: 1 }, // 1 day
                        },
                    ],
                },
            });
        }
    }

    /**
     * Upload raw image
     */
    async uploadRaw(
        userId: string,
        imageId: string,
        stream: Readable,
        mimeType: string
    ): Promise<string> {
        const ext = this.getExtension(mimeType);
        const path = `${userId}/${imageId}.${ext}`;
        const file = this.rawBucket.file(path);

        await new Promise((resolve, reject) => {
            stream
                .pipe(
                    file.createWriteStream({
                        metadata: {
                            contentType: mimeType,
                        },
                    })
                )
                .on('error', reject)
                .on('finish', resolve);
        });

        return path;
    }

    /**
     * Upload processed result
     */
    async uploadResult(
        imageId: string,
        revisionId: string,
        buffer: Buffer,
        mimeType: string
    ): Promise<string> {
        const ext = this.getExtension(mimeType);
        const path = `${imageId}_${revisionId}.${ext}`;
        const file = this.resultsBucket.file(path);

        await file.save(buffer, {
            metadata: {
                contentType: mimeType,
            },
        });

        return path;
    }

    /**
     * Upload thumbnail
     */
    async uploadThumbnail(imageId: string, buffer: Buffer): Promise<string> {
        const path = `${imageId}.webp`;
        const file = this.thumbBucket.file(path);

        await file.save(buffer, {
            metadata: {
                contentType: 'image/webp',
                cacheControl: 'public, max-age=3600',
            },
        });

        return path;
    }

    /**
     * Download file as buffer
     */
    async download(bucketType: 'raw' | 'results' | 'thumb', path: string): Promise<Buffer> {
        const bucket = this.getBucket(bucketType);
        const file = bucket.file(path);
        const [buffer] = await file.download();
        return buffer;
    }

    /**
     * Download file as stream
     */
    downloadStream(bucketType: 'raw' | 'results' | 'thumb', path: string): Readable {
        const bucket = this.getBucket(bucketType);
        const file = bucket.file(path);
        return file.createReadStream();
    }

    /**
     * Generate signed URL (1h TTL)
     */
    async getSignedUrl(
        bucketType: 'raw' | 'results' | 'thumb',
        path: string,
        expiresInMinutes: number = 60
    ): Promise<string> {
        const bucket = this.getBucket(bucketType);
        const file = bucket.file(path);

        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + expiresInMinutes * 60 * 1000,
        });

        return url;
    }

    /**
     * Delete file
     */
    async delete(bucketType: 'raw' | 'results' | 'thumb', path: string): Promise<void> {
        const bucket = this.getBucket(bucketType);
        const file = bucket.file(path);
        await file.delete({ ignoreNotFound: true });
    }

    /**
     * Delete all files for an image
     */
    async deleteAllForImage(imageId: string): Promise<void> {
        // Delete from results bucket
        const [files] = await this.resultsBucket.getFiles({
            prefix: imageId,
        });

        await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));

        // Delete thumbnail
        await this.delete('thumb', `${imageId}.webp`);
    }

    /**
     * Check if file exists
     */
    async exists(bucketType: 'raw' | 'results' | 'thumb', path: string): Promise<boolean> {
        const bucket = this.getBucket(bucketType);
        const file = bucket.file(path);
        const [exists] = await file.exists();
        return exists;
    }

    /**
     * Get file metadata
     */
    async getMetadata(bucketType: 'raw' | 'results' | 'thumb', path: string) {
        const bucket = this.getBucket(bucketType);
        const file = bucket.file(path);
        const [metadata] = await file.getMetadata();
        return metadata;
    }

    private getBucket(type: 'raw' | 'results' | 'thumb'): Bucket {
        switch (type) {
            case 'raw':
                return this.rawBucket;
            case 'results':
                return this.resultsBucket;
            case 'thumb':
                return this.thumbBucket;
        }
    }

    private getExtension(mimeType: string): string {
        const map: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
        };
        return map[mimeType] || 'bin';
    }
}
