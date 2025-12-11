import sharp, { Sharp } from 'sharp';

export enum OpType {
    ROTATE = 1,
    FLIP = 2,
    RESIZE = 3,
    COMPRESS = 4,
}

export interface OperationParams {
    [key: string]: any;
}

export abstract class Operation {
    abstract type: OpType;
    abstract params: OperationParams;

    /**
     * Validate operation parameters
     */
    abstract validate(): boolean;

    /**
     * Convert operation to Sharp pipeline
     */
    abstract toSharp(pipeline: Sharp): Sharp;

    /**
     * Serialize operation to JSON
     */
    toJSON(): { type: OpType; params: OperationParams } {
        return {
            type: this.type,
            params: this.params,
        };
    }

    /**
     * Deserialize operation from JSON
     */
    static fromJSON(data: { type: OpType; params: OperationParams }): Operation {
        switch (data.type) {
            case OpType.ROTATE:
                return new RotateOp(data.params.degrees);
            case OpType.FLIP:
                return new FlipOp(data.params.horizontal, data.params.vertical);
            case OpType.RESIZE:
                return new ResizeOp(data.params.width, data.params.height);
            case OpType.COMPRESS:
                return new CompressOp(data.params.quality);
            default:
                throw new Error(`Unknown operation type: ${data.type}`);
        }
    }
}

/**
 * Rotate operation: 90°, 180°, 270° clockwise
 */
export class RotateOp extends Operation {
    type = OpType.ROTATE;
    params: { degrees: number };

    constructor(degrees: number) {
        super();
        this.params = { degrees };
    }

    validate(): boolean {
        return [90, 180, 270].includes(this.params.degrees);
    }

    toSharp(pipeline: Sharp): Sharp {
        if (!this.validate()) {
            throw new Error(`Invalid rotation degrees: ${this.params.degrees}`);
        }
        return pipeline.rotate(this.params.degrees);
    }
}

/**
 * Flip operation: horizontal and/or vertical
 */
export class FlipOp extends Operation {
    type = OpType.FLIP;
    params: { horizontal: boolean; vertical: boolean };

    constructor(horizontal: boolean, vertical: boolean) {
        super();
        this.params = { horizontal, vertical };
    }

    validate(): boolean {
        return typeof this.params.horizontal === 'boolean' &&
            typeof this.params.vertical === 'boolean';
    }

    toSharp(pipeline: Sharp): Sharp {
        if (!this.validate()) {
            throw new Error('Invalid flip parameters');
        }
        if (this.params.horizontal) {
            pipeline = pipeline.flop();
        }
        if (this.params.vertical) {
            pipeline = pipeline.flip();
        }
        return pipeline;
    }
}

/**
 * Resize operation: with aspect ratio lock
 */
export class ResizeOp extends Operation {
    type = OpType.RESIZE;
    params: { width?: number; height?: number };

    constructor(width?: number, height?: number) {
        super();
        this.params = { width, height };
    }

    validate(): boolean {
        const { width, height } = this.params;
        if (!width && !height) return false;
        if (width && (width < 200 || width > 4000)) return false;
        if (height && (height < 200 || height > 4000)) return false;
        return true;
    }

    toSharp(pipeline: Sharp): Sharp {
        if (!this.validate()) {
            throw new Error('Invalid resize parameters');
        }
        return pipeline.resize(this.params.width, this.params.height, {
            fit: 'inside',
            withoutEnlargement: false,
            kernel: 'lanczos3',
        });
    }
}

/**
 * Compress operation: adjust quality 10-100%
 */
export class CompressOp extends Operation {
    type = OpType.COMPRESS;
    params: { quality: number };

    constructor(quality: number) {
        super();
        this.params = { quality };
    }

    validate(): boolean {
        return this.params.quality >= 10 && this.params.quality <= 100;
    }

    toSharp(pipeline: Sharp): Sharp {
        if (!this.validate()) {
            throw new Error(`Invalid quality: ${this.params.quality}`);
        }
        // Apply quality to JPEG/WebP output
        return pipeline.jpeg({ quality: this.params.quality })
            .webp({ quality: this.params.quality });
    }
}
