import React, { useState } from 'react';
import { apiClient } from '../services/ApiClient';

interface TransformControlsProps {
    imageId: string;
    onTransformComplete: (downloadUrl: string) => void;
    onError: (error: string) => void;
}

export const TransformControls: React.FC<TransformControlsProps> = ({
    imageId,
    onTransformComplete,
    onError,
}) => {
    const [processing, setProcessing] = useState(false);
    const [resizeWidth, setResizeWidth] = useState<number>(800);
    const [quality, setQuality] = useState<number>(80);

    const handleTransform = async (operation: () => Promise<any>) => {
        setProcessing(true);
        try {
            const result = await operation();
            onTransformComplete(result.downloadUrl);
        } catch (error: any) {
            onError(error.message || 'Operation failed');
        } finally {
            setProcessing(false);
        }
    };

    const buttonStyle = (disabled: boolean = false): React.CSSProperties => ({
        padding: '12px 24px',
        fontSize: '14px',
        fontWeight: 600,
        border: 'none',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: disabled ? '#ccc' : '#4CAF50',
        color: 'white',
        transition: 'all 0.2s ease',
        opacity: disabled ? 0.6 : 1,
        boxShadow: disabled ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
    });

    const sectionStyle: React.CSSProperties = {
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: '#f9f9f9',
        borderRadius: '12px',
        border: '1px solid #e0e0e0',
    };

    return (
        <div style={{ width: '100%' }}>
            {/* Rotate Section */}
            <div style={sectionStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333', fontSize: '16px' }}>
                    🔄 Rotate
                </h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                        style={buttonStyle(processing)}
                        disabled={processing}
                        onClick={() => handleTransform(() => apiClient.rotate(imageId, 90))}
                    >
                        90° CW
                    </button>
                    <button
                        style={buttonStyle(processing)}
                        disabled={processing}
                        onClick={() => handleTransform(() => apiClient.rotate(imageId, 180))}
                    >
                        180°
                    </button>
                    <button
                        style={buttonStyle(processing)}
                        disabled={processing}
                        onClick={() => handleTransform(() => apiClient.rotate(imageId, 270))}
                    >
                        90° CCW
                    </button>
                </div>
            </div>

            {/* Flip Section */}
            <div style={sectionStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333', fontSize: '16px' }}>
                    ↔️ Flip
                </h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                        style={buttonStyle(processing)}
                        disabled={processing}
                        onClick={() => handleTransform(() => apiClient.flip(imageId, true, false))}
                    >
                        Horizontal
                    </button>
                    <button
                        style={buttonStyle(processing)}
                        disabled={processing}
                        onClick={() => handleTransform(() => apiClient.flip(imageId, false, true))}
                    >
                        Vertical
                    </button>
                </div>
            </div>

            {/* Resize Section */}
            <div style={sectionStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333', fontSize: '16px' }}>
                    📐 Resize
                </h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        type="number"
                        min="200"
                        max="4000"
                        value={resizeWidth}
                        onChange={(e) => setResizeWidth(parseInt(e.target.value))}
                        style={{
                            padding: '10px',
                            fontSize: '14px',
                            border: '1px solid #ccc',
                            borderRadius: '6px',
                            width: '120px',
                        }}
                    />
                    <span style={{ color: '#666' }}>px (width)</span>
                    <button
                        style={buttonStyle(processing)}
                        disabled={processing}
                        onClick={() => handleTransform(() => apiClient.resize(imageId, resizeWidth))}
                    >
                        Apply Resize
                    </button>
                </div>
            </div>

            {/* Compress Section */}
            <div style={sectionStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333', fontSize: '16px' }}>
                    🗜️ Compress
                </h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        type="range"
                        min="10"
                        max="100"
                        value={quality}
                        onChange={(e) => setQuality(parseInt(e.target.value))}
                        style={{ flex: 1, minWidth: '150px' }}
                    />
                    <span style={{ color: '#666', minWidth: '60px' }}>Quality: {quality}%</span>
                    <button
                        style={buttonStyle(processing)}
                        disabled={processing}
                        onClick={() => handleTransform(() => apiClient.compress(imageId, quality))}
                    >
                        Apply Compress
                    </button>
                </div>
            </div>

            {/* Undo Section */}
            <div style={sectionStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333', fontSize: '16px' }}>
                    ⏪ Undo
                </h3>
                <button
                    style={{
                        ...buttonStyle(processing),
                        backgroundColor: processing ? '#ccc' : '#FF9800',
                    }}
                    disabled={processing}
                    onClick={() => handleTransform(() => apiClient.undo(imageId))}
                >
                    Undo Last Operation
                </button>
            </div>

            {processing && (
                <div
                    style={{
                        textAlign: 'center',
                        padding: '20px',
                        backgroundColor: '#e3f2fd',
                        borderRadius: '8px',
                        marginTop: '20px',
                    }}
                >
                    <p style={{ margin: 0, color: '#1976d2', fontWeight: 600 }}>
                        Processing... Please wait
                    </p>
                </div>
            )}
        </div>
    );
};
