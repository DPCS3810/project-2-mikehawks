import axios, { AxiosInstance, AxiosError } from 'axios';

export interface ImageUploadResponse {
    imageId: string;
    thumbnailUrl: string;
    size: number;
    mimeType: string;
}

export interface ImageMetadata {
    id: string;
    size: number;
    mimeType: string;
    createdAt: string;
    downloadUrl: string;
}

export interface OperationResponse {
    revisionId: string;
    downloadUrl: string;
    operation: string;
    params: any;
}

export class ApiClient {
    private client: AxiosInstance;

    constructor(baseURL?: string) {
        // Dynamic base URL: use relative '/api' proxy locally, absolute URL in production
        const productionURL = 'https://image-editor-backend-u2phnmzv2q-uc.a.run.app';
        // @ts-ignore
        const defaultURL = import.meta.env.DEV ? '/api' : productionURL;

        this.client = axios.create({
            baseURL: baseURL || defaultURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                if (error.response) {
                    const message = (error.response.data as any)?.error || 'An error occurred';
                    throw new Error(message);
                } else if (error.request) {
                    throw new Error('No response from server');
                } else {
                    throw new Error(error.message);
                }
            }
        );
    }

    /**
     * Upload an image
     */
    async uploadImage(file: File): Promise<ImageUploadResponse> {
        const formData = new FormData();
        formData.append('image', file);

        const response = await this.client.post<ImageUploadResponse>(
            '/v1/images',
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        );

        return response.data;
    }

    /**
     * Get image metadata
     */
    async getImage(imageId: string): Promise<ImageMetadata> {
        const response = await this.client.get<ImageMetadata>(`/v1/images/${imageId}`);
        return response.data;
    }

    /**
     * Delete image
     */
    async deleteImage(imageId: string): Promise<void> {
        await this.client.delete(`/v1/images/${imageId}`);
    }

    /**
     * Rotate image
     */
    async rotate(imageId: string, degrees: number): Promise<OperationResponse> {
        const response = await this.client.post<OperationResponse>(
            `/v1/images/${imageId}/rotate`,
            { degrees }
        );
        return response.data;
    }

    /**
     * Flip image
     */
    async flip(imageId: string, horizontal: boolean, vertical: boolean): Promise<OperationResponse> {
        const response = await this.client.post<OperationResponse>(
            `/v1/images/${imageId}/flip`,
            { horizontal, vertical }
        );
        return response.data;
    }

    /**
     * Resize image
     */
    async resize(imageId: string, width?: number, height?: number): Promise<OperationResponse> {
        const response = await this.client.post<OperationResponse>(
            `/v1/images/${imageId}/resize`,
            { width, height }
        );
        return response.data;
    }

    /**
     * Compress image
     */
    async compress(imageId: string, quality: number): Promise<OperationResponse> {
        const response = await this.client.post<OperationResponse>(
            `/v1/images/${imageId}/compress`,
            { quality }
        );
        return response.data;
    }

    /**
     * Undo last operation
     */
    async undo(imageId: string): Promise<OperationResponse> {
        const response = await this.client.post<OperationResponse>(
            `/v1/images/${imageId}/undo`
        );
        return response.data;
    }

    /**
     * Get revision history
     */
    async getHistory(imageId: string): Promise<any> {
        const response = await this.client.get(`/v1/images/${imageId}/history`);
        return response.data;
    }
}

export const apiClient = new ApiClient();
