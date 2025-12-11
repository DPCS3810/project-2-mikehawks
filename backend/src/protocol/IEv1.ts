import { OpType, Operation, RotateOp, FlipOp, ResizeOp, CompressOp } from '../operations/Operation';
import { createHash } from 'crypto';

/**
 * IEv1 Binary Protocol
 * 
 * Header (12 bytes):
 * - 0-1: version (uint16) = 1
 * - 2-3: opType (uint16)
 * - 4-7: payloadLen (uint32)
 * - 8-11: checksum (uint32) CRC32 of payload
 * 
 * Payload (variable):
 * - rotate: 1 byte (degrees) 90 | 180 | 270
 * - flip: 1 byte (flags) bit0=horizontal, bit1=vertical
 * - resize: 8 bytes (width uint32, height uint32)
 * - compress: 1 byte (quality) 10-100
 */

const PROTOCOL_VERSION = 1;
const HEADER_SIZE = 12;

export class IEv1Protocol {
    /**
     * Encode an operation to binary format
     */
    static encode(operation: Operation): Buffer {
        const payload = this.encodePayload(operation);
        const checksum = this.calculateCRC32(payload);

        const header = Buffer.allocUnsafe(HEADER_SIZE);
        header.writeUInt16LE(PROTOCOL_VERSION, 0);
        header.writeUInt16LE(operation.type, 2);
        header.writeUInt32LE(payload.length, 4);
        header.writeUInt32LE(checksum, 8);

        return Buffer.concat([header, payload]);
    }

    /**
     * Decode binary data to an operation
     */
    static decode(data: Buffer): Operation {
        if (data.length < HEADER_SIZE) {
            throw new Error('Invalid IEv1 data: too short');
        }

        const version = data.readUInt16LE(0);
        if (version !== PROTOCOL_VERSION) {
            throw new Error(`Unsupported protocol version: ${version}`);
        }

        const opType = data.readUInt16LE(2) as OpType;
        const payloadLen = data.readUInt32LE(4);
        const expectedChecksum = data.readUInt32LE(8);

        if (data.length < HEADER_SIZE + payloadLen) {
            throw new Error('Invalid IEv1 data: payload truncated');
        }

        const payload = data.subarray(HEADER_SIZE, HEADER_SIZE + payloadLen);
        const actualChecksum = this.calculateCRC32(payload);

        if (actualChecksum !== expectedChecksum) {
            throw new Error('IEv1 checksum mismatch');
        }

        return this.decodePayload(opType, payload);
    }

    /**
     * Encode operation parameters to payload
     */
    private static encodePayload(operation: Operation): Buffer {
        switch (operation.type) {
            case OpType.ROTATE: {
                const op = operation as RotateOp;
                const payload = Buffer.allocUnsafe(1);
                payload.writeUInt8(op.params.degrees, 0);
                return payload;
            }

            case OpType.FLIP: {
                const op = operation as FlipOp;
                const flags = (op.params.horizontal ? 1 : 0) | (op.params.vertical ? 2 : 0);
                const payload = Buffer.allocUnsafe(1);
                payload.writeUInt8(flags, 0);
                return payload;
            }

            case OpType.RESIZE: {
                const op = operation as ResizeOp;
                const payload = Buffer.allocUnsafe(8);
                payload.writeUInt32LE(op.params.width || 0, 0);
                payload.writeUInt32LE(op.params.height || 0, 4);
                return payload;
            }

            case OpType.COMPRESS: {
                const op = operation as CompressOp;
                const payload = Buffer.allocUnsafe(1);
                payload.writeUInt8(op.params.quality, 0);
                return payload;
            }

            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }

    /**
     * Decode payload to operation
     */
    private static decodePayload(opType: OpType, payload: Buffer): Operation {
        switch (opType) {
            case OpType.ROTATE: {
                if (payload.length < 1) throw new Error('Invalid rotate payload');
                const degrees = payload.readUInt8(0);
                return new RotateOp(degrees);
            }

            case OpType.FLIP: {
                if (payload.length < 1) throw new Error('Invalid flip payload');
                const flags = payload.readUInt8(0);
                const horizontal = (flags & 1) !== 0;
                const vertical = (flags & 2) !== 0;
                return new FlipOp(horizontal, vertical);
            }

            case OpType.RESIZE: {
                if (payload.length < 8) throw new Error('Invalid resize payload');
                const width = payload.readUInt32LE(0) || undefined;
                const height = payload.readUInt32LE(4) || undefined;
                return new ResizeOp(width, height);
            }

            case OpType.COMPRESS: {
                if (payload.length < 1) throw new Error('Invalid compress payload');
                const quality = payload.readUInt8(0);
                return new CompressOp(quality);
            }

            default:
                throw new Error(`Unknown operation type: ${opType}`);
        }
    }

    /**
     * Calculate CRC32 checksum
     */
    private static calculateCRC32(data: Buffer): number {
        // Simple CRC32 implementation
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    /**
     * Get size reduction vs JSON
     */
    static getSizeComparison(operation: Operation): { binary: number; json: number; savings: number } {
        const binary = this.encode(operation).length;
        const json = Buffer.from(JSON.stringify(operation.toJSON())).length;
        const savings = Math.round((1 - binary / json) * 100);
        return { binary, json, savings };
    }
}
