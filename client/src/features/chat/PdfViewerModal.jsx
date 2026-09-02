import { useState, useEffect, useRef } from 'react';
import {
  X, Download, ExternalLink, Printer, FileText,
  Maximize2, Minimize2, Loader2, AlertCircle, RefreshCw
} from 'lucide-react';
import api from '../../lib/api';
import { downloadFile } from '../../lib/fileDownload';
import toast from 'react-hot-toast';

export default function PdfViewerModal({ isOpen, onClose, pdfUrl, fileName, fileSize }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef(null);

  const finalFileName = (fileName || 'document.pdf').endsWith('.pdf')
    ? (fileName || 'document.pdf')
    : `${fileName || 'document'}.pdf`;

  // Fetch the PDF via our signed backend proxy and create a local in-memory blob URL
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

    const fetchPdfBlob = async () => {
      try {
        // Fetch through our backend proxy which handles Cloudinary signing & CORS
        const res = await api.get(
          `/upload/download?url=${encodeURIComponent(pdfUrl)}&filename=${encodeURIComponent(finalFileName)}`,
          { responseType: 'blob' }
        );

        if (!isMounted) return;

        if (res.data) {
          const blob = new Blob([res.data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setLoading(false);
          return;
        }
        throw new Error('Empty response from download server');
      } catch (proxyErr) {
        console.warn('Backend proxy fetch failed, trying direct blob fetch:', proxyErr);

        // Fallback: direct CORS fetch
        try {
          const directRes = await fetch(pdfUrl, { mode: 'cors' });
          if (directRes.ok && isMounted) {
            const blob = await directRes.blob();
            const url = URL.createObjectURL(blob);
            setBlobUrl(url);
            setLoading(false);
            return;
          }
        } catch (directErr) {
          console.warn('Direct fetch also failed:', directErr);
        }

        if (isMounted) {
          setError('Unable to load PDF document.');
          setLoading(false);
        }
      }
    };

    fetchPdfBlob();

    return () => {
      isMounted = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [isOpen, pdfUrl]);

  if (!isOpen || !pdfUrl) return null;

  // Instant In-Memory Direct Download (100% Guaranteed to Save to Storage)
  const handleInstantDownload = (e) => {
    e?.stopPropagation();
    try {
      if (blobUrl) {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`Saved ${finalFileName}`);
        return;
      }
      downloadFile(pdfUrl, finalFileName, 'application/pdf');
    } catch (err) {
      toast.error('Download failed');
    }
  };

  const handleOpenExternal = (e) => {
    e?.stopPropagation();
    if (blobUrl) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } else {
      downloadFile(pdfUrl, finalFileName, 'application/pdf');
    }
  };

  const handlePrint = (e) => {
    e?.stopPropagation();
    if (blobUrl) {
      const printWin = window.open(blobUrl);
      if (printWin) {
        printWin.focus();
        printWin.print?.();
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
    >
      {/* ── Top Header Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-card/95 border-b border-dark-border z-20 shadow-xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 font-bold shadow-lg shadow-red-500/20">
            <FileText className="w-5 h-5 text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md md:max-w-lg">
              {finalFileName}
            </p>
            <p className="text-[11px] text-surface-400 flex items-center gap-1.5">
              <span>{fileSize ? `${(fileSize / 1024).toFixed(0)} KB • ` : ''}Portable Document Format (PDF)</span>
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Open in New Window */}
          {blobUrl && (
            <button
              onClick={handleOpenExternal}
              className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white border border-dark-border/60 transition-all active:scale-95"
              title="Open in new window"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white border border-dark-border/60 transition-all active:scale-95"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Print */}
          {blobUrl && (
            <button
              onClick={handlePrint}
              className="hidden sm:flex p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white border border-dark-border/60 transition-all active:scale-95"
              title="Print PDF"
            >
              <Printer className="w-4 h-4" />
            </button>
          )}

          {/* PROMINENT INSTANT DOWNLOAD BUTTON */}
          <button
            onClick={handleInstantDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white font-bold text-xs shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50 transition-all active:scale-95"
            title="Download PDF directly to storage"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white border border-dark-border/60 transition-all active:scale-95 ml-1"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── PDF Document Viewport Area ── */}
      <div className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center overflow-hidden bg-[#111318]">
        {loading && (
          <div className="my-auto flex flex-col items-center gap-3 text-surface-400 animate-fade-in">
            <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
            <p className="text-sm font-semibold text-white">Opening Inbuilt PDF Reader...</p>
            <p className="text-xs text-surface-500">Loading document securely</p>
          </div>
        )}

        {error && !loading && (
          <div className="my-auto flex flex-col items-center gap-4 text-center max-w-sm p-6 rounded-3xl bg-dark-card border border-dark-border animate-scale-in">
            <div className="w-12 h-12 rounded-2xl bg-accent-red/20 text-accent-red flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Unable to display PDF</h3>
              <p className="text-xs text-surface-400 mt-1">{error}</p>
            </div>
            <button
              onClick={handleInstantDownload}
              className="w-full py-2.5 rounded-xl gradient-primary text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25"
            >
              <Download className="w-4 h-4" />
              Download PDF File
            </button>
          </div>
        )}

        {!loading && !error && blobUrl && (
          <div className="w-full h-full max-w-5xl bg-white rounded-2xl overflow-hidden shadow-2xl transition-all border border-dark-border/40">
            <iframe
              src={`${blobUrl}#toolbar=1`}
              title={finalFileName}
              className="w-full h-full border-0 rounded-2xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}
