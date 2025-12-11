import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { apiClient } from '../services/ApiClient';

interface ImageUploaderProps {
    onUploadSuccess: (imageId: string, thumbnailUrl: string) => void;
    onError: (error: string) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onUploadSuccess, onError }) => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            if (acceptedFiles.length === 0) return;

            const file = acceptedFiles[0];

            // Validate file size (10MB)
            if (file.size > 10 * 1024 * 1024) {
                onError('Image too large (max 10 MB)');
                return;
            }

            // Validate file type
            if (!['image/jpeg', 'image/png'].includes(file.type)) {
                onError('Only JPG and PNG allowed');
                return;
            }

            setUploading(true);
            setProgress(0);

            try {
                // Simulate progress
                const progressInterval = setInterval(() => {
                    setProgress((prev) => Math.min(prev + 10, 90));
                }, 200);

                const result = await apiClient.uploadImage(file);

                clearInterval(progressInterval);
                setProgress(100);

                setTimeout(() => {
                    onUploadSuccess(result.imageId, result.thumbnailUrl);
                    setUploading(false);
                    setProgress(0);
                }, 500);
            } catch (error: any) {
                onError(error.message || 'Upload failed');
                setUploading(false);
                setProgress(0);
            }
        },
        [onUploadSuccess, onError]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
        },
        multiple: false,
        disabled: uploading,
    });

    return (
        <div
            {...getRootProps()}
            style={{
                border: '3px dashed',
                borderColor: isDragActive ? '#4CAF50' : '#ccc',
                borderRadius: '12px',
                padding: '60px 40px',
                textAlign: 'center',
                cursor: uploading ? 'not-allowed' : 'pointer',
                backgroundColor: isDragActive ? '#f0f8ff' : '#fafafa',
                transition: 'all 0.3s ease',
                minHeight: '250px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            <input {...getInputProps()} />

            {uploading ? (
                <div style={{ width: '100%', maxWidth: '400px' }}>
                    <p style={{ fontSize: '18px', marginBottom: '20px', color: '#333' }}>
                        Uploading... {progress}%
                    </p>
                    <div
                        style={{
                            width: '100%',
                            height: '8px',
                            backgroundColor: '#e0e0e0',
                            borderRadius: '4px',
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            style={{
                                width: `${progress}%`,
                                height: '100%',
                                backgroundColor: '#4CAF50',
                                transition: 'width 0.3s ease',
                            }}
                        />
                    </div>
                </div>
            ) : (
                <>
                    <svg
                        width="64"
                        height="64"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#4CAF50"
                        strokeWidth="2"
                        style={{ marginBottom: '20px' }}
                    >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>

                    <p style={{ fontSize: '20px', fontWeight: 600, marginBottom: '10px', color: '#333' }}>
                        {isDragActive ? 'Drop your image here' : 'Drag & drop an image'}
                    </p>
                    <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                        or click to browse
                    </p>
                    <p style={{ fontSize: '12px', color: '#999' }}>
                        Supports: JPG, PNG (max 10 MB)
                    </p>
                </>
            )}
        </div>
    );
};
