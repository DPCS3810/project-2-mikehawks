import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import routes, { initializeRoutes } from './api/routes';
import { PostgresClient } from './database/PostgresClient';
import { RedisClient } from './cache/RedisClient';
import { CloudStorage } from './storage/CloudStorage';
import { ImageService } from './services/ImageService';
import { RevisionService } from './services/RevisionService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.set('trust proxy', 1); // Trust first proxy (Cloud Load Balancer)
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting: 20 req/s per IP
const limiter = rateLimit({
    windowMs: 1000,
    max: 20,
    message: 'Too many requests from this IP, please try again later',
});
app.use(limiter);

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Initialize services
let db: PostgresClient;
let redis: RedisClient;
let storage: CloudStorage;

async function initializeServices() {
    console.log('Initializing services...');

    // Initialize instances
    db = new PostgresClient();
    redis = new RedisClient();
    storage = new CloudStorage();

    // In production/deployment, we might want to skip DB check to let the container start
    if (process.env.SKIP_DB_CHECK === 'true') {
        console.warn('⚠️  SKIP_DB_CHECK enabled. Skipping database and cache connection.');
        // Initialize storage only if needed
        if (process.env.GCP_PROJECT_ID) {
            await storage.initialize();
            console.log('✓ Cloud Storage initialized');
        } else {
            console.log('⚠️  Cloud Storage skipped (no GCP credentials)');
        }
        // Initialize services with potentially uninitialized db/redis
        const imageService = new ImageService(db, storage, redis);
        const revisionService = new RevisionService(db, storage, redis);
        initializeRoutes(imageService, revisionService);
        console.log('✓ Services initialized (with DB/Redis connection skipped)');
        return;
    }

    try {
        await db.initialize();
        console.log('✓ PostgreSQL initialized');

        await redis.connect();
        console.log('✓ Redis connected');

        // Initialize Cloud Storage
        if (process.env.GCP_PROJECT_ID) {
            await storage.initialize();
            console.log('✓ Cloud Storage initialized');
        } else {
            console.log('⚠️  Cloud Storage skipped (no GCP credentials)');
        }
    } catch (error) {
        console.error('Failed to initialize database or cache:', error);
        throw error; // Re-throw to be caught by the start() function
    }

    // Initialize services
    const imageService = new ImageService(db, storage, redis);
    const revisionService = new RevisionService(db, storage, redis);

    // Initialize routes with services
    initializeRoutes(imageService, revisionService);
    console.log('✓ Services initialized');
}

// Routes
app.use(routes);

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', err);

    // Handle specific error types
    if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message });
    }

    if (err.message.includes('Invalid')) {
        return res.status(400).json({ error: err.message });
    }

    if (err.message.includes('Cannot decode image')) {
        return res.status(422).json({ error: 'Cannot decode image' });
    }

    if (err.message.includes('timeout')) {
        return res.status(504).json({ error: 'Try again later' });
    }

    // Generic error
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');

    if (db) await db.close();
    if (redis) await redis.close();

    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');

    if (db) await db.close();
    if (redis) await redis.close();

    process.exit(0);
});

// Start server
async function start() {
    try {
        await initializeServices();

        app.listen(PORT, () => {
            console.log(`\n🚀 Image Editor API running on port ${PORT}`);
            console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   Health check: http://localhost:${PORT}/health\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Only start if this is the main module
if (require.main === module) {
    start();
}

export default app;
