import { useState, useEffect, useCallback } from 'react';
import {
  X, Download, Share2, ZoomIn, ZoomOut, RotateCw,
  ChevronLeft, ChevronRight, Maximize2
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ImageViewerModal({
  images = [],
  initialIndex = 0,
  onClose,
  onForward,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const currentImage = images[currentIndex] || { url: '' };

  const handlePrev = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, z + 0.25));
      if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.25));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  const handleDownload = async () => {
    if (!currentImage.url) return;
    try {
      const response = await fetch(currentImage.url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = currentImage.fileName || `nexchat_image_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success('Image saved!');
    } catch {
      window.open(currentImage.url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/95 backdrop-blur-2xl flex flex-col justify-between p-3 sm:p-5 select-none animate-fade-in">
      {/* Top Action Header */}
      <div className="w-full flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs sm:text-sm font-semibold text-white/80">
            {currentIndex + 1} / {images.length}
          </span>
          {currentImage.fileName && (
            <span className="text-xs text-surface-400 truncate max-w-[200px] hidden sm:inline">
              {currentImage.fileName}
            </span>
          )}
        </div>

        {/* Toolbar controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-dark-card/70 border border-dark-border/60 px-3 py-1.5 rounded-2xl backdrop-blur-md">
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="p-1.5 rounded-xl hover:bg-dark-hover text-surface-300 hover:text-white transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-1.5 rounded-xl hover:bg-dark-hover text-surface-300 hover:text-white transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 rounded-xl hover:bg-dark-hover text-surface-300 hover:text-white transition-colors"
            title="Rotate"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-xl hover:bg-dark-hover text-surface-300 hover:text-white transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          {onForward && (
            <button
              onClick={() => onForward(currentImage)}
              className="p-1.5 rounded-xl hover:bg-dark-hover text-surface-300 hover:text-white transition-colors"
              title="Forward"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-dark-hover hover:bg-accent-red/20 text-surface-300 hover:text-accent-red transition-colors ml-1"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden my-2">
        {/* Previous Button */}
        {images.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute left-2 sm:left-4 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-black/60 hover:bg-black/90 border border-white/10 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95"
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Display Image */}
        <div className="w-full h-full flex items-center justify-center p-2">
          <img
            src={currentImage.url}
            alt="Viewer"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
            className="max-w-full max-h-[85vh] object-contain rounded-xl select-none"
            draggable={false}
          />
        </div>

        {/* Next Button */}
        {images.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-2 sm:right-4 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-black/60 hover:bg-black/90 border border-white/10 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95"
            title="Next (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-2 overflow-x-auto py-2 z-10 hide-scrollbar">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => {
                setZoom(1);
                setRotation(0);
                setCurrentIndex(idx);
              }}
              className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 ${
                currentIndex === idx
                  ? 'border-primary-500 scale-110 shadow-lg'
                  : 'border-transparent opacity-50 hover:opacity-100'
              }`}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
