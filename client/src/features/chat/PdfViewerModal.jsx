import { useState, useEffect, useRef } from 'react';
import {
  X, Download, Printer, FileText, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, RotateCw, Maximize2, Minimize2, Loader2,
  AlertCircle
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import api from '../../lib/api';
import toast from 'react-hot-toast';

// Configure the worker from same-origin static public folder
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  } catch (e) {
    console.warn('PDF worker assignment error:', e);
  }
}

export default function PdfViewerModal({ isOpen, onClose, pdfUrl, fileName, fileSize }) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [rawPdfBuffer, setRawPdfBuffer] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [useEmbedFallback, setUseEmbedFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  const finalFileName = (fileName || 'document.pdf').endsWith('.pdf')
    ? (fileName || 'document.pdf')
    : `${fileName || 'document'}.pdf`;

  // Fetch and parse PDF document on open
  useEffect(() => {
    if (!isOpen || !pdfUrl) {
      setPdfDoc(null);
      setRawPdfBuffer(null);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      setError(null);
      setUseEmbedFallback(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setCurrentPage(1);
    setRotation(0);
    setUseEmbedFallback(false);

    const loadPdfDocument = async () => {
      try {
        // Fetch binary data via our authenticated download proxy
        const res = await api.get(
          `/upload/download?url=${encodeURIComponent(pdfUrl)}&filename=${encodeURIComponent(finalFileName)}`,
          { responseType: 'arraybuffer' }
        );

        if (!isMounted) return;

        const buffer = res.data;
        setRawPdfBuffer(buffer);

        // Create in-memory blob for fallback and downloading
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const bUrl = URL.createObjectURL(blob);
        if (!isMounted) return;
        setBlobUrl(bUrl);

        try {
          // Parse with PDF.js legacy engine
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buffer),
            isEvalSupported: false,
            useSystemFonts: true,
          });

          const doc = await loadingTask.promise;
          if (!isMounted) return;

          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);
        } catch (pdfErr) {
          console.warn('PDF.js canvas parsing failed, switching to native embed viewer:', pdfErr);
          if (isMounted) {
            setUseEmbedFallback(true);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Inbuilt PDF fetch error:', err);
        if (isMounted) {
          setError('Unable to load PDF document.');
          setLoading(false);
        }
      }
    };

    loadPdfDocument();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel?.();
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [isOpen, pdfUrl]);

  // Render current page onto HTML5 canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || currentPage < 1 || useEmbedFallback) return;

    let isCancelled = false;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel?.();
        }

        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        const renderContext = {
          canvasContext: context,
          transform,
          viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Canvas render error, falling back to native embed:', err);
          setUseEmbedFallback(true);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage, scale, rotation, useEmbedFallback]);

  if (!isOpen || !pdfUrl) return null;

  // Direct In-Memory Blob Download
  const handleDownload = (e) => {
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
      if (rawPdfBuffer) {
        const blob = new Blob([rawPdfBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success(`Saved ${finalFileName}`);
      }
    } catch (err) {
      console.error('Download error:', err);
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
              <span>{fileSize ? `${(fileSize / 1024).toFixed(0)} KB` : 'PDF Document'}</span>
              {numPages > 0 && <span>• {numPages} {numPages === 1 ? 'Page' : 'Pages'}</span>}
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Zoom Controls (Active in Canvas mode) */}
          {!useEmbedFallback && (
            <div className="hidden md:flex items-center bg-dark-input rounded-xl p-0.5 border border-dark-border/60">
              <button
                onClick={() => setScale((s) => Math.max(s - 0.2, 0.6))}
                className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-surface-300 px-2 min-w-[48px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={() => setScale((s) => Math.min(s + 0.2, 2.5))}
                className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Rotate */}
          {!useEmbedFallback && (
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white border border-dark-border/60 transition-all active:scale-95"
              title="Rotate Clockwise"
            >
              <RotateCw className="w-4 h-4" />
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
            onClick={handleDownload}
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

      {/* ── PDF Document Viewer Area ── */}
      <div className="flex-1 w-full overflow-auto flex flex-col items-center justify-start p-2 sm:p-6 bg-[#111318]">
        {loading && (
          <div className="my-auto flex flex-col items-center gap-3 text-surface-400 animate-fade-in">
            <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
            <p className="text-sm font-semibold text-white">Opening Inbuilt PDF Reader...</p>
            <p className="text-xs text-surface-500">Rendering pages directly in app</p>
          </div>
        )}

        {error && !loading && (
          <div className="my-auto flex flex-col items-center gap-4 text-center max-w-sm p-6 rounded-3xl bg-dark-card border border-dark-border animate-scale-in">
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
              Download PDF File
            </button>
          </div>
        )}

        {/* Primary View: PDF.js Canvas Rendering */}
        {!loading && !error && !useEmbedFallback && (
          <div className="flex flex-col items-center shadow-2xl rounded-xl overflow-hidden bg-white my-auto animate-scale-in">
            <canvas ref={canvasRef} className="block max-w-full" />
          </div>
        )}

        {/* Fallback View: Native PDF Viewer via in-memory blob */}
        {!loading && !error && useEmbedFallback && blobUrl && (
          <div className="w-full h-full max-w-5xl bg-white rounded-2xl overflow-hidden shadow-2xl border border-dark-border/40">
            <embed
              src={`${blobUrl}#toolbar=1`}
              type="application/pdf"
              title={finalFileName}
              className="w-full h-full border-0 rounded-2xl"
            />
          </div>
        )}
      </div>

      {/* ── Bottom Page Navigator Bar (WhatsApp / Acrobat style) ── */}
      {!loading && !error && !useEmbedFallback && numPages > 0 && (
        <div className="flex items-center justify-between px-6 py-2.5 bg-dark-card/95 border-t border-dark-border z-20">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-input hover:bg-dark-hover disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold text-white border border-dark-border/60 transition-all active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-surface-400">Page</span>
            <input
              type="number"
              min={1}
              max={numPages}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= numPages) {
                  setCurrentPage(val);
                }
              }}
              className="w-12 py-1 text-center text-xs font-bold text-white bg-dark-input border border-dark-border rounded-lg focus:outline-none focus:border-primary-500"
            />
            <span className="text-xs font-semibold text-surface-400">of {numPages}</span>
          </div>

          <button
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(p + 1, numPages))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-input hover:bg-dark-hover disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold text-white border border-dark-border/60 transition-all active:scale-95"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
