import { useState } from 'react';
import { X, Download, ExternalLink, Printer, FileText, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { downloadFile } from '../../lib/fileDownload';

export default function PdfViewerModal({ isOpen, onClose, pdfUrl, fileName, fileSize }) {
  const [zoom, setZoom] = useState(100);

  if (!isOpen || !pdfUrl) return null;

  const handleDownload = (e) => {
    e?.stopPropagation();
    downloadFile(pdfUrl, fileName || 'document.pdf', 'application/pdf');
  };

  const handleOpenExternal = (e) => {
    e?.stopPropagation();
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const handlePrint = (e) => {
    e?.stopPropagation();
    const printWin = window.open(pdfUrl, '_blank');
    if (printWin) {
      printWin.focus();
      printWin.print?.();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-xl animate-fade-in select-none">
      {/* WhatsApp-Style Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-card/90 border-b border-dark-border z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 font-bold text-xs shadow-md">
            <FileText className="w-5 h-5 text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate max-w-md">{fileName || 'Document.pdf'}</p>
            <p className="text-xs text-surface-400">
              {fileSize ? `${(fileSize / 1024).toFixed(0)} KB • ` : ''}Portable Document Format (PDF)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom In/Out */}
          <div className="hidden sm:flex items-center gap-1 bg-dark-input rounded-xl p-1 border border-dark-border/60">
            <button
              onClick={() => setZoom((z) => Math.max(z - 25, 50))}
              className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-surface-300 px-1 min-w-[40px] text-center">{zoom}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(z + 25, 200))}
              className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Open in New Window */}
          <button
            onClick={handleOpenExternal}
            className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white border border-dark-border/60 transition-all active:scale-95"
            title="Open in new window"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          {/* Print */}
          <button
            onClick={handlePrint}
            className="hidden sm:flex p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white border border-dark-border/60 transition-all active:scale-95"
            title="Print document"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Download Button (Prominent) */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white font-bold text-xs shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all active:scale-95"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white border border-dark-border/60 transition-all active:scale-95 ml-1"
            title="Close viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PDF Viewport / Embed Container */}
      <div className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center overflow-auto bg-[#18191c]">
        <div
          className="w-full h-full max-w-5xl bg-white rounded-2xl overflow-hidden shadow-2xl transition-all flex flex-col"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
        >
          <object
            data={`${pdfUrl}#toolbar=1&navpanes=0`}
            type="application/pdf"
            className="w-full h-full flex-1 border-0"
          >
            {/* Fallback iframe */}
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`}
              title={fileName}
              className="w-full h-full border-0"
            />
          </object>
        </div>
      </div>
    </div>
  );
}
