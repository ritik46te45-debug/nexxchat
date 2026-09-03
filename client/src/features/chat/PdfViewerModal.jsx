import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Download, Printer, FileText, Maximize2, Minimize2, Loader2,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Inbuilt PDF Viewer Modal
 * 
 * Root cause of past failures: PDF.js requires a web worker that must be served
 * from the same origin. When the worker fails to load (CSP, CORS, bundler issues),
 * the entire PDF.js pipeline silently breaks with "Unable to render".
 * 
 * This rewrite eliminates PDF.js entirely and uses the browser's native PDF
 * rendering engine (Chrome/Edge/Firefox all have built-in PDF viewers).
 * The PDF binary is fetched via the backend proxy (which handles Cloudinary
 * signed download), converted to a same-origin blob: URL, and displayed
 * in an <object> tag. This approach is 100% reliable on all modern browsers.
 * 
 * Download is untouched — it uses the same working blob download path.
 */
export default function PdfViewerModal({ isOpen, onClose, pdfUrl, fileName, fileSize }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef(null);

  const finalFileName = (fileName || 'document.pdf').endsWith('.pdf')
    ? (fileName || 'document.pdf')
    : `${fileName || 'document'}.pdf`;

  // Build the backend proxy URL (same logic as working download)
  const getProxyUrl = useCallback(() => {
    const getBaseURL = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl) {
        const clean = envUrl.replace(/\/+$/, '');
        return clean.endsWith('/api') ? clean : `${clean}/api`;
      }
      if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000/api';
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return `http://${host}:5000/api`;
      }
      return 'https://nexxchat-5d29.onrender.com/api';
    };
    return `${getBaseURL()}/upload/download?url=${encodeURIComponent(pdfUrl)}&filename=${encodeURIComponent(finalFileName)}`;
  }, [pdfUrl, finalFileName]);

  // Fetch the PDF via backend proxy and create blob URL
  useEffect(() => {
    if (!isOpen || !pdfUrl) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchPdf = async () => {
      try {
        // Use raw fetch (NOT the axios api instance) to avoid interceptors/auth issues
        const proxyUrl = getProxyUrl();
        const response = await fetch(proxyUrl);

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (!isMounted) return;

        // Validate it's actually a PDF (starts with %PDF)
        const header = new Uint8Array(arrayBuffer.slice(0, 5));
        const headerStr = String.fromCharCode(...header);
        if (!headerStr.startsWith('%PDF')) {
          throw new Error('Response is not a valid PDF file');
        }

        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      } catch (err) {
        console.error('PDF viewer fetch error:', err);
        if (isMounted) {
          setError(err.message || 'Failed to load PDF');
          setLoading(false);
        }
      }
    };

    fetchPdf();

    return () => {
      isMounted = false;
    };
  }, [isOpen, pdfUrl, getProxyUrl]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  if (!isOpen || !pdfUrl) return null;

  // Download — uses existing working blob
  const handleDownload = (e) => {
    e?.stopPropagation();
    if (blobUrl) {
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Saved ${finalFileName}`);
    }
  };

  const handlePrint = (e) => {
    e?.stopPropagation();
    if (blobUrl) {
      const printWin = window.open(blobUrl);
      if (printWin) {
        printWin.focus();
        setTimeout(() => printWin.print?.(), 500);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-2xl animate-fade-in select-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Header Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-card/95 border-b border-dark-border z-20 shadow-xl flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/20">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md md:max-w-lg">
              {finalFileName}
            </p>
            <p className="text-[11px] text-surface-400">
              {fileSize ? `${(fileSize / 1024).toFixed(0)} KB • ` : ''}PDF Document
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white border border-dark-border/60 transition-all active:scale-95"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {blobUrl && (
            <button
              onClick={handlePrint}
              className="hidden sm:flex p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white border border-dark-border/60 transition-all active:scale-95"
              title="Print PDF"
            >
              <Printer className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleDownload}
            disabled={!blobUrl}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white font-bold text-xs shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50 transition-all active:scale-95 disabled:opacity-50"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white border border-dark-border/60 transition-all active:scale-95 ml-1"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── PDF Viewer Area ── */}
      <div className="flex-1 w-full overflow-hidden flex items-center justify-center bg-[#1a1a2e]">
        {loading && (
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
            <p className="text-sm font-semibold text-white">Loading PDF...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm p-6 rounded-3xl bg-dark-card border border-dark-border animate-scale-in">
            <div className="w-12 h-12 rounded-2xl bg-accent-red/20 text-accent-red flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Unable to Load PDF</h3>
              <p className="text-xs text-surface-400 mt-1">{error}</p>
            </div>
            <button
              onClick={handleDownload}
              className="w-full py-2.5 rounded-xl gradient-primary text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25"
            >
              <Download className="w-4 h-4" />
              Download PDF Instead
            </button>
          </div>
        )}

        {!loading && !error && blobUrl && (
          <object
            data={`${blobUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
            type="application/pdf"
            className="w-full h-full"
            title={finalFileName}
          >
            {/* Fallback for browsers without native PDF support (very rare) */}
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-sm text-surface-400">Your browser cannot display PDFs inline.</p>
              <button
                onClick={handleDownload}
                className="px-6 py-2.5 rounded-xl gradient-primary text-white font-bold text-xs flex items-center gap-2 shadow-lg"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          </object>
        )}
      </div>
    </div>
  );
}
