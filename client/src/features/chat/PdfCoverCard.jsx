import { useState, useEffect } from 'react';
import { FileText, Download, Eye, Loader2 } from 'lucide-react';
import { getPdfCoverThumbnail } from '../../lib/pdfThumbnail';

/**
 * WhatsApp-Style PDF Document Card with First-Page Cover Preview
 *
 * @param {Object} props
 * @param {File|string} props.source - File object (during composing) or URL string (after sending)
 * @param {string} props.fileName - Display name of the file
 * @param {number} [props.fileSize] - Size in bytes
 * @param {boolean} [props.isOwn=false] - If the message belongs to current user
 * @param {Function} [props.onPreview] - Click handler to open full PDF viewer
 * @param {Function} [props.onDownload] - Click handler to download file
 * @param {Function} [props.onRemove] - Optional remove button handler (used in composer)
 */
export default function PdfCoverCard({
  source,
  fileName = 'document.pdf',
  fileSize,
  isOwn = false,
  onPreview,
  onDownload,
  onRemove,
  compact = false,
}) {
  const [thumbnail, setThumbnail] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!source) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    getPdfCoverThumbnail(source, { width: 300, maxHeight: 360 })
      .then((res) => {
        if (!isMounted) return;
        setThumbnail(res.dataUrl);
        setNumPages(res.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('PDF thumbnail generation fallback:', err.message);
        setError(true);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [source]);

  const formattedSize = fileSize
    ? fileSize > 1024 * 1024
      ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
      : `${(fileSize / 1024).toFixed(0)} KB`
    : '';

  // Compact mode for MessageComposer attachment bar
  if (compact) {
    return (
      <div className="relative rounded-2xl bg-dark-input/90 border border-dark-border p-2 flex items-center gap-2.5 min-w-[170px] max-w-[220px] flex-shrink-0 animate-scale-in shadow-md group">
        {/* Cover Preview or Icon */}
        <div className="w-11 h-14 rounded-lg overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 relative flex items-center justify-center">
          {loading ? (
            <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />
          ) : thumbnail ? (
            <img src={thumbnail} alt="" className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs">
              <FileText className="w-5 h-5 text-red-400" />
            </div>
          )}

          {numPages && (
            <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] font-bold text-white text-center py-0.5">
              {numPages}p
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-white truncate" title={fileName}>
            {fileName}
          </p>
          <p className="text-[9px] text-surface-400 flex items-center gap-1 mt-0.5">
            <span className="px-1 py-0.2 rounded bg-red-500/20 text-red-400 font-bold text-[8px]">PDF</span>
            {formattedSize && <span>{formattedSize}</span>}
          </p>
        </div>

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="w-5 h-5 rounded-full bg-black/70 hover:bg-accent-red text-white flex items-center justify-center transition-colors absolute -top-1.5 -right-1.5 shadow"
            title="Remove"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // Full WhatsApp-Style Document Card with Cover Page (used in MessageBubble)
  return (
    <div
      onClick={(e) => {
        if (onPreview) {
          e.stopPropagation();
          onPreview();
        }
      }}
      className={`rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer select-none max-w-[280px] sm:max-w-[320px] shadow-lg group ${
        isOwn
          ? 'bg-primary-950/40 border-primary-500/30 hover:border-primary-400/50'
          : 'bg-dark-card/90 border-dark-border/80 hover:border-surface-400/40'
      }`}
    >
      {/* 1. Cover Page Thumbnail Area */}
      <div className="relative w-full h-44 sm:h-52 bg-gradient-to-b from-[#181f2c] to-[#0d131f] overflow-hidden flex items-center justify-center border-b border-dark-border/40">
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-surface-400">
            <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
            <span className="text-[11px] font-medium tracking-wide">Rendering preview...</span>
          </div>
        ) : thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt=""
              className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
            />
            {/* Subtle Gradient Shadow Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

            {/* Quick Preview Hover Indicator */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 backdrop-blur-[1px]">
              <div className="px-3 py-1.5 rounded-full bg-black/80 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xl border border-white/20">
                <Eye className="w-3.5 h-3.5 text-primary-400" />
                <span>Tap to read</span>
              </div>
            </div>
          </>
        ) : (
          /* Fallback when PDF cannot render cover */
          <div className="flex flex-col items-center justify-center gap-2.5 p-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shadow-md">
              <FileText className="w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-surface-300">PDF Document</span>
          </div>
        )}

        {/* Top-Right Page Count Badge */}
        {numPages && (
          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white shadow-md flex items-center gap-1">
            <FileText className="w-3 h-3 text-red-400" />
            <span>{numPages} {numPages === 1 ? 'page' : 'pages'}</span>
          </div>
        )}
      </div>

      {/* 2. Document Information & Actions Bar */}
      <div className="p-3 flex items-center justify-between gap-3 bg-dark-card/95">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Red PDF File Badge */}
          <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center flex-shrink-0 font-black text-[11px] shadow-sm tracking-tighter">
            PDF
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate group-hover:text-primary-300 transition-colors" title={fileName}>
              {fileName}
            </p>
            <p className="text-[10px] text-surface-400 flex items-center gap-1.5 mt-0.5">
              {formattedSize && <span>{formattedSize}</span>}
              {formattedSize && numPages && <span>•</span>}
              {numPages && <span>{numPages} {numPages === 1 ? 'page' : 'pages'}</span>}
            </p>
          </div>
        </div>

        {/* Download Action Button */}
        {onDownload && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="p-2 rounded-xl bg-surface-800/80 hover:bg-primary-500 hover:text-white text-surface-300 transition-all flex-shrink-0 active:scale-95 border border-dark-border hover:border-transparent shadow-sm"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
