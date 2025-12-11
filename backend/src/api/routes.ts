import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ImageService } from '../services/ImageService';
import { RevisionService } from '../services/RevisionService';
import { RotateOp, FlipOp, ResizeOp, CompressOp } from '../operations/Operation';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },
});

// Dependency injection - will be set by main app
let imageService: ImageService;
let revisionService: RevisionService;

export function initializeRoutes(imgSvc: ImageService, revSvc: RevisionService) {
    imageService = imgSvc;
    revisionService = revSvc;
}

/**
 * Error handler wrapper
 */
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * POST /v1/images - Upload new image
 */
router.post(
    '/v1/images',
    upload.single('image'),
    asyncHandler(async (req: Request, res: Response) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const userId = req.headers['x-user-id'] as string || require('uuid').v4();
        const stream = require('stream').Readable.from(req.file.buffer);

        try {
            const result = await imageService.upload(
                stream,
                userId,
                req.file.mimetype,
                req.file.size
            );

            res.status(201).json({
                imageId: result.image.id,
                thumbnailUrl: result.thumbnailUrl,
                size: result.image.size_bytes,
                mimeType: result.image.mime_type,
            });
        } catch (error: any) {
            if (error.message.includes('too large')) {
                return res.status(413).json({ error: 'Image too large (max 10 MB)' });
            }
            if (error.message.includes('Only JPG and PNG')) {
                return res.status(415).json({ error: 'Only JPG and PNG allowed' });
            }
            throw error;
        }
    })
);

/**
 * GET /v1/images/:id - Get image metadata
 */
router.get(
    '/v1/images/:id',
    asyncHandler(async (req: Request, res: Response) => {
        const image = await imageService.getMetadata(req.params.id);
        if (!image) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const downloadUrl = await imageService.getDownloadUrl(req.params.id);
        res.json({
            id: image.id,
            size: image.size_bytes,
            mimeType: image.mime_type,
            createdAt: image.created_at,
            downloadUrl: downloadUrl.url,
        });
    })
);

/**
 * DELETE /v1/images/:id - Delete image
 */
router.delete(
    '/v1/images/:id',
    asyncHandler(async (req: Request, res: Response) => {
        await imageService.delete(req.params.id);
        res.status(204).send();
    })
);

/**
 * POST /v1/images/:id/rotate - Rotate image
 */
router.post(
    '/v1/images/:id/rotate',
    asyncHandler(async (req: Request, res: Response) => {
        const { degrees } = req.body;
        if (![90, 180, 270].includes(degrees)) {
            return res.status(400).json({ error: 'Degrees must be 90, 180, or 270' });
        }

        const operation = new RotateOp(degrees);
        const revision = await revisionService.applyOp(req.params.id, operation);
        const downloadUrl = await revisionService.getDownloadUrl(revision.id);

        res.status(202).json({
            revisionId: revision.id,
            downloadUrl,
            operation: 'rotate',
            params: { degrees },
        });
    })
);

/**
 * POST /v1/images/:id/flip - Flip image
 */
router.post(
    '/v1/images/:id/flip',
    asyncHandler(async (req: Request, res: Response) => {
        const { horizontal, vertical } = req.body;
        const operation = new FlipOp(!!horizontal, !!vertical);
        const revision = await revisionService.applyOp(req.params.id, operation);
        const downloadUrl = await revisionService.getDownloadUrl(revision.id);

        res.status(202).json({
            revisionId: revision.id,
            downloadUrl,
            operation: 'flip',
            params: { horizontal, vertical },
        });
    })
);

/**
 * POST /v1/images/:id/resize - Resize image
 */
router.post(
    '/v1/images/:id/resize',
    asyncHandler(async (req: Request, res: Response) => {
        const { width, height } = req.body;

        if (width && (width < 200 || width > 4000)) {
            return res.status(400).json({ error: 'Width must be between 200 and 4000 pixels' });
        }
        if (height && (height < 200 || height > 4000)) {
            return res.status(400).json({ error: 'Height must be between 200 and 4000 pixels' });
        }

        const operation = new ResizeOp(width, height);
        const revision = await revisionService.applyOp(req.params.id, operation);
        const downloadUrl = await revisionService.getDownloadUrl(revision.id);

        res.status(202).json({
            revisionId: revision.id,
            downloadUrl,
            operation: 'resize',
            params: { width, height },
        });
    })
);

/**
 * POST /v1/images/:id/compress - Compress image
 */
router.post(
    '/v1/images/:id/compress',
    asyncHandler(async (req: Request, res: Response) => {
        const { quality } = req.body;

        if (quality < 10 || quality > 100) {
            return res.status(400).json({ error: 'Quality must be between 10 and 100' });
        }

        const operation = new CompressOp(quality);
        const revision = await revisionService.applyOp(req.params.id, operation);
        const downloadUrl = await revisionService.getDownloadUrl(revision.id);

        res.status(202).json({
            revisionId: revision.id,
            downloadUrl,
            operation: 'compress',
            params: { quality },
        });
    })
);

/**
 * POST /v1/images/:id/undo - Undo last operation
 */
router.post(
    '/v1/images/:id/undo',
    asyncHandler(async (req: Request, res: Response) => {
        try {
            const revision = await revisionService.undo(req.params.id);
            const downloadUrl = await revisionService.getDownloadUrl(revision.id);

            res.json({
                revisionId: revision.id,
                downloadUrl,
            });
        } catch (error: any) {
            if (error.message.includes('No revisions') || error.message.includes('Cannot undo')) {
                return res.status(400).json({ error: error.message });
            }
            throw error;
        }
    })
);

/**
 * GET /v1/images/:id/history - Get revision history
 */
router.get(
    '/v1/images/:id/history',
    asyncHandler(async (req: Request, res: Response) => {
        const history = await revisionService.getHistory(req.params.id);
        res.json({
            imageId: req.params.id,
            revisions: history.map((rev) => ({
                id: rev.id,
                opType: rev.op_type,
                params: rev.op_params,
                createdAt: rev.created_at,
            })),
        });
    })
);

/**
 * GET /health - Health check
 */
router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /v1/images/:id/thumbnail - Get thumbnail (local storage)
 */
router.get(
    '/v1/images/:id/thumbnail',
    asyncHandler(async (req: Request, res: Response) => {
        const imageId = req.params.id;
        const buffer = await imageService.getLocalFile(imageId, 'thumb', `${imageId}.webp`);
        res.set('Content-Type', 'image/webp');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(buffer);
    })
);

/**
 * GET /v1/images/:id/download - Download image (local storage)
 */
router.get(
    '/v1/images/:id/download',
    asyncHandler(async (req: Request, res: Response) => {
        const image = await imageService.getMetadata(req.params.id);
        if (!image) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const filename = image.original_path.split('/').pop() || 'image';
        const buffer = await imageService.getLocalFile(req.params.id, 'raw', filename);

        res.set('Content-Type', image.mime_type);
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    })
);

/**
 * GET /v1/revisions/:id/download - Download revision (local storage)
 */
router.get(
    '/v1/revisions/:id/download',
    asyncHandler(async (req: Request, res: Response) => {
        const revision = await revisionService.getRevision(req.params.id);
        if (!revision) {
            return res.status(404).json({ error: 'Revision not found' });
        }

        const image = await imageService.getMetadata(revision.image_id);
        if (!image) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const filename = revision.storage_path.split('/').pop() || 'image';
        const buffer = await imageService.getLocalFile(revision.image_id, 'results', filename);

        res.set('Content-Type', image.mime_type);
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    })
);

export default router;

