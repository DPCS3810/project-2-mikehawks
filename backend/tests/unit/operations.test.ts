import { RotateOp, FlipOp, ResizeOp, CompressOp } from '../../src/operations/Operation';
import sharp from 'sharp';

describe('Operation Classes', () => {
    describe('RotateOp', () => {
        it('should validate correct degrees', () => {
            expect(new RotateOp(90).validate()).toBe(true);
            expect(new RotateOp(180).validate()).toBe(true);
            expect(new RotateOp(270).validate()).toBe(true);
        });

        it('should reject invalid degrees', () => {
            expect(new RotateOp(45).validate()).toBe(false);
            expect(new RotateOp(360).validate()).toBe(false);
        });

        it('should apply rotation to Sharp pipeline', async () => {
            const op = new RotateOp(90);
            const input = await sharp({
                create: {
                    width: 100,
                    height: 200,
                    channels: 3,
                    background: { r: 255, g: 0, b: 0 },
                },
            }).png().toBuffer();

            const pipeline = sharp(input);
            const result = await op.toSharp(pipeline).toBuffer();
            const metadata = await sharp(result).metadata();

            // After 90° rotation, width and height should swap
            expect(metadata.width).toBe(200);
            expect(metadata.height).toBe(100);
        });
    });

    describe('FlipOp', () => {
        it('should validate flip parameters', () => {
            expect(new FlipOp(true, false).validate()).toBe(true);
            expect(new FlipOp(false, true).validate()).toBe(true);
            expect(new FlipOp(true, true).validate()).toBe(true);
        });

        it('should apply flip to Sharp pipeline', async () => {
            const op = new FlipOp(true, false);
            const pipeline = sharp({
                create: {
                    width: 100,
                    height: 100,
                    channels: 3,
                    background: { r: 255, g: 0, b: 0 },
                },
            });

            const result = await op.toSharp(pipeline).toBuffer();
            expect(result).toBeDefined();
        });
    });

    describe('ResizeOp', () => {
        it('should validate resize parameters', () => {
            expect(new ResizeOp(800).validate()).toBe(true);
            expect(new ResizeOp(undefined, 600).validate()).toBe(true);
            expect(new ResizeOp(800, 600).validate()).toBe(true);
        });

        it('should reject invalid dimensions', () => {
            expect(new ResizeOp(100).validate()).toBe(false); // Too small
            expect(new ResizeOp(5000).validate()).toBe(false); // Too large
        });

        it('should apply resize to Sharp pipeline', async () => {
            const op = new ResizeOp(50);
            const pipeline = sharp({
                create: {
                    width: 100,
                    height: 100,
                    channels: 3,
                    background: { r: 255, g: 0, b: 0 },
                },
            });

            const result = await op.toSharp(pipeline).toBuffer();
            const metadata = await sharp(result).metadata();

            expect(metadata.width).toBeLessThanOrEqual(50);
        });
    });

    describe('CompressOp', () => {
        it('should validate quality parameters', () => {
            expect(new CompressOp(50).validate()).toBe(true);
            expect(new CompressOp(10).validate()).toBe(true);
            expect(new CompressOp(100).validate()).toBe(true);
        });

        it('should reject invalid quality', () => {
            expect(new CompressOp(5).validate()).toBe(false);
            expect(new CompressOp(101).validate()).toBe(false);
        });
    });
});
