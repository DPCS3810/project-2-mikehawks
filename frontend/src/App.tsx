import { useState } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { TransformControls } from './components/TransformControls';

function App() {
    const [imageId, setImageId] = useState<string | null>(null);
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleUploadSuccess = (id: string, thumbnailUrl: string) => {
        setImageId(id);
        setCurrentImageUrl(thumbnailUrl);
        setSuccess('Image uploaded successfully!');
        setError(null);
        setTimeout(() => setSuccess(null), 3000);
    };

    const handleTransformComplete = (downloadUrl: string) => {
        setCurrentImageUrl(downloadUrl);
        setSuccess('Operation completed successfully!');
        setError(null);
        setTimeout(() => setSuccess(null), 3000);
    };

    const handleError = (errorMessage: string) => {
        setError(errorMessage);
        setSuccess(null);
        setTimeout(() => setError(null), 5000);
    };

    const handleReset = () => {
        setImageId(null);
        setCurrentImageUrl(null);
        setError(null);
        setSuccess(null);
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '40px 20px',
            }}
        >
            <div
                style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                }}
            >
                {/* Header */}
                <header style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <h1
                        style={{
                            fontSize: '48px',
                            fontWeight: 800,
                            color: 'white',
                            margin: '0 0 10px 0',
                            textShadow: '2px 2px 4px rgba(0,0,0,0.2)',
                        }}
                    >
                        ✨ Image Editor
                    </h1>
                    <p
                        style={{
                            fontSize: '18px',
                            color: 'rgba(255,255,255,0.9)',
                            margin: 0,
                        }}
                    >
                        Cloud-Native Image Processing Platform
                    </p>
                </header>

                {/* Notifications */}
                {error && (
                    <div
                        style={{
                            backgroundColor: '#f44336',
                            color: 'white',
                            padding: '16px 24px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            animation: 'slideIn 0.3s ease',
                        }}
                    >
                        ❌ {error}
                    </div>
                )}

                {success && (
                    <div
                        style={{
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            padding: '16px 24px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            animation: 'slideIn 0.3s ease',
                        }}
                    >
                        ✅ {success}
                    </div>
                )}

                {/* Main Content */}
                <div
                    style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        padding: '40px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                    }}
                >
                    {!imageId ? (
                        <ImageUploader onUploadSuccess={handleUploadSuccess} onError={handleError} />
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                            {/* Image Preview */}
                            <div>
                                <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>
                                    Image Preview
                                </h2>
                                {currentImageUrl && (
                                    <div
                                        style={{
                                            border: '2px solid #e0e0e0',
                                            borderRadius: '12px',
                                            overflow: 'hidden',
                                            backgroundColor: '#f5f5f5',
                                            padding: '20px',
                                            textAlign: 'center',
                                        }}
                                    >
                                        <img
                                            src={currentImageUrl}
                                            alt="Current image"
                                            style={{
                                                maxWidth: '100%',
                                                maxHeight: '500px',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                                            }}
                                        />
                                    </div>
                                )}
                                <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                                    <a
                                        href={currentImageUrl || '#'}
                                        download
                                        style={{
                                            flex: 1,
                                            padding: '14px',
                                            backgroundColor: '#2196F3',
                                            color: 'white',
                                            textDecoration: 'none',
                                            borderRadius: '8px',
                                            textAlign: 'center',
                                            fontWeight: 600,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                        }}
                                    >
                                        📥 Download
                                    </a>
                                    <button
                                        onClick={handleReset}
                                        style={{
                                            flex: 1,
                                            padding: '14px',
                                            backgroundColor: '#f44336',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                        }}
                                    >
                                        🔄 New Image
                                    </button>
                                </div>
                            </div>

                            {/* Transform Controls */}
                            <div>
                                <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>
                                    Transform Tools
                                </h2>
                                <TransformControls
                                    imageId={imageId}
                                    onTransformComplete={handleTransformComplete}
                                    onError={handleError}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <footer style={{ textAlign: 'center', marginTop: '40px', color: 'rgba(255,255,255,0.8)' }}>
                    <p style={{ margin: 0, fontSize: '14px' }}>
                        Built with React + TypeScript + Node.js | Cloud-Native Architecture
                    </p>
                </footer>
            </div>
        </div>
    );
}

export default App;
