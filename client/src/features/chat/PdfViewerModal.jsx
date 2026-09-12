import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Download, Printer, FileText, Maximize2, Minimize2, Loader2,
  AlertCircle, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * PDF Viewer Modal — Cross-platform (Desktop + Android WebView)
 *
 * Root cause of mobile failures:
 * - Android WebView does NOT have a built-in PDF renderer
 * - <object type="application/pdf"> silently fails on mobile
 * - Blob URL + <a download> also doesn't work on Android WebView
 *
 * Fix: Detect mobile/Capacitor and use system browser for viewing/downloading.
 * On desktop, use iframe with blob URL (works on all modern browsers).
 */

const isMobileOrCapacitor = () => {
  if (typeof window === 'undefined') return false;
  // Capacitor native app
  if (window.Capacitor?.isNativePlatform?.()) return true;
  // Mobile user agent fallback
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
};

const getProxyUrl = (pdfUrl, fileName) => {
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
  return `${getBaseURL()}/upload/download?url=${encodeURIComponent(pdfUrl)}&filename=${encodeURIComponent(fileName)}`;
};

export default function PdfViewerModal({ isOpen, onClose, pdfUrl, fileName, fileSize }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef(null);
  const isMobile = isMobileOrCapacitor();

  const finalFileName = (fileName || 'document.pdf').endsWith('.pdf')
    ? (fileName || 'document.pdf')
    : `${fileName || 'document'}.pdf`;

  const proxyUrl = pdfUrl ? getProxyUrl(pdfUrl, finalFileName) : '';

  // On mobile, auto-open in system browser and close modal
  useEffect(() => {
    if (!isOpen || !pdfUrl || !isMobile) return;

    // Open PDF in system browser (which HAS a PDF renderer)
    try {
      // Capacitor handles '_system' to open in device's native browser
      // which has built-in PDF rendering (Chrome, Samsung Internet, etc.)
      const target = window.Capacitor?.isNativePlatform?.() ? '_system' : '_blank';
      window.open(proxyUrl, target);
      toast.success(`Opening ${finalFileName}...`);
    } catch (err) {

      console.error('Failed to open PDF in system browser:', err);
      toast.error('Failed to open PDF');
    }
    onClose();
  }, [isOpen, pdfUrl, isMobile, proxyUrl, finalFileName, onClose]);

  // Desktop: Fetch PDF blob for inline viewing
  useEffect(() => {
    if (!isOpen || !pdfUrl || isMobile) {
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
  }, [isOpen, pdfUrl, isMobile, proxyUrl]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Mobile exits early (opened in system browser)
  if (isMobile || !isOpen || !pdfUrl) return null;

  // Download — uses blob on desktop
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
              onClick={() => window.open(proxyUrl, '_blank')}
              className="w-full py-2.5 rounded-xl gradient-primary text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Browser
            </button>
          </div>
        )}

        {!loading && !error && blobUrl && (
          <iframe
            src={`${blobUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
            className="w-full h-full border-0"
            title={finalFileName}
          />
        )}
      </div>
    </div>
  );
}
