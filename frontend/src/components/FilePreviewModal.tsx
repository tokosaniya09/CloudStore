import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Code,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Search,
  FileSpreadsheet,
  Music,
  Video,
  Maximize,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { FileItem } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

// Configure PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
} catch (e) {
  console.warn('PDF.js worker setup warning:', e);
}

interface FilePreviewModalProps {
  file: FileItem | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // PDF Viewer State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(1.0);
  const [pdfRotation, setPdfRotation] = useState(0);
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfFallbackToIframe, setPdfFallbackToIframe] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan & Drag State (for PDF and Image zoom navigation)
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Image Controls State
  const [imageZoom, setImageZoom] = useState(1.0);
  const [imageRotation, setImageRotation] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Text & Code State
  const [textContent, setTextContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeFilter, setCodeFilter] = useState('');

  // CSV Table State
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);

  // Reset state on file change
  useEffect(() => {
    if (file) {
      setLoading(true);
      setError(null);
      setTextContent(null);
      setCsvRows(null);
      setImageZoom(1.0);
      setImageRotation(0);
      setImageDimensions(null);
      setPdfDoc(null);
      setCurrentPage(1);
      setTotalPages(0);
      setPdfZoom(1.0);
      setPdfRotation(0);
      setPdfFallbackToIframe(false);
      setPanOffset({ x: 0, y: 0 });
      setCodeFilter('');

      loadPreview();
    }
  }, [file]);

  const loadPreview = async () => {
    if (!file) return;
    try {
      setLoading(true);
      setError(null);

      const res = await apiClient.getDownloadUrl(file.id);
      setDownloadUrl(res.downloadUrl);

      const ext = file.extension.toLowerCase();

      // 1. Text / Code
      if (['txt', 'md', 'json', 'js', 'ts', 'tsx', 'html', 'css', 'xml', 'log', 'sql', 'py', 'sh', 'yaml', 'yml'].includes(ext)) {
        try {
          const textRes = await fetch(res.downloadUrl);
          if (textRes.ok) {
            const text = await textRes.text();
            setTextContent(text);
          }
        } catch (err: any) {
          console.warn('Text fetch note:', err);
        }
      }

      // 2. CSV / TSV
      if (ext === 'csv' || ext === 'tsv') {
        try {
          const csvRes = await fetch(res.downloadUrl);
          if (csvRes.ok) {
            const csvText = await csvRes.text();
            setTextContent(csvText);
            const delimiter = ext === 'tsv' ? '\t' : ',';
            const lines = csvText
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean);
            const parsed = lines.map((line) => {
              const matches = line.match(/(".*?"|[^",\t]+)(?=\s*[,\\t]|\s*$)/g);
              if (matches) {
                return matches.map((cell) => cell.replace(/^"|"$/g, '').trim());
              }
              return line.split(delimiter).map((c) => c.trim());
            });
            setCsvRows(parsed);
          }
        } catch (err: any) {
          console.warn('CSV fetch note:', err);
        }
      }

      // 3. PDF Load via PDF.js
      if (ext === 'pdf') {
        try {
          const loadingTask = pdfjsLib.getDocument({
            url: res.downloadUrl,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
            cMapPacked: true,
          });
          const pdf = await loadingTask.promise;
          setPdfDoc(pdf);
          setTotalPages(pdf.numPages);
          setCurrentPage(1);
        } catch (pdfErr) {
          console.warn('PDF.js reader note, falling back to native viewer:', pdfErr);
          setPdfFallbackToIframe(true);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load file preview');
    } finally {
      setLoading(false);
    }
  };

  // Render PDF Canvas when in high-res canvas mode
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || pdfFallbackToIframe) return;

    let isMounted = true;
    const renderPage = async () => {
      try {
        setPdfRendering(true);
        const page = await pdfDoc.getPage(currentPage);
        if (!isMounted) return;

        // Apply scale & rotation
        const viewport = page.getViewport({
          scale: pdfZoom * 1.5,
          rotation: (page.rotate + pdfRotation) % 360,
        });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width / 1.5) + 'px';
        canvas.style.height = Math.floor(viewport.height / 1.5) + 'px';

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          transform: transform,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
      } catch (err) {
        console.warn('PDF rendering note:', err);
      } finally {
        if (isMounted) setPdfRendering(false);
      }
    };

    renderPage();

    return () => {
      isMounted = false;
    };
  }, [pdfDoc, currentPage, pdfZoom, pdfRotation, pdfFallbackToIframe]);

  // Mouse Pan Handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panOffset };
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resetPanAndZoom = () => {
    setPanOffset({ x: 0, y: 0 });
    setPdfZoom(1.0);
    setImageZoom(1.0);
    setPdfRotation(0);
    setImageRotation(0);
  };

  if (!file) return null;

  const ext = file.extension.toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
  const isPdf = ext === 'pdf';
  const isCsv = ext === 'csv' || ext === 'tsv';
  const isTextOrCode = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'html', 'css', 'xml', 'log', 'sql', 'py', 'sh', 'yaml', 'yml'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
  const isAudio = ['mp3', 'wav', 'aac'].includes(ext);
  const isOfficeDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);

  const handleCopyCode = () => {
    if (textContent) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredLines = textContent
    ? textContent.split('\n').filter((line) => line.toLowerCase().includes(codeFilter.toLowerCase()))
    : [];

  return (
    <div
      className="fixed inset-0 bg-gray-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-fadeIn select-none"
      onMouseUp={handleMouseUp}
    >
      <div
        className={`bg-white border border-gray-200/90 rounded-3xl w-full shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen ? 'max-w-[98vw] h-[96vh]' : 'max-w-5xl h-[88vh]'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-blue-50 border border-blue-200/80 text-blue-600 rounded-2xl shrink-0 shadow-2xs">
              {isImage ? (
                <ImageIcon className="w-5 h-5" />
              ) : isPdf ? (
                <FileText className="w-5 h-5 text-red-500" />
              ) : isCsv ? (
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              ) : isVideo ? (
                <Video className="w-5 h-5 text-purple-600" />
              ) : isAudio ? (
                <Music className="w-5 h-5 text-amber-600" />
              ) : (
                <Code className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight truncate flex items-center gap-2">
                <span>{file.name}</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/70 rounded-md">
                  v{file.currentVersionNumber}
                </span>
              </h3>
              <p className="text-xs text-gray-400 font-medium flex items-center gap-2">
                <span>{(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                <span>•</span>
                <span className="capitalize">{file.extension.toUpperCase()} File</span>
                {imageDimensions && (
                  <>
                    <span>•</span>
                    <span>
                      {imageDimensions.width} × {imageDimensions.height} px
                    </span>
                  </>
                )}
                {isPdf && totalPages > 0 && (
                  <>
                    <span>•</span>
                    <span>
                      {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {downloadUrl && (
              <>
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Open file directly in new browser tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open in Tab</span>
                </a>
                <a
                  href={`${downloadUrl}&download=true`}
                  download={file.name}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Download to computer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </>
            )}

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer hidden sm:block"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer ml-1"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Secondary Contextual Toolbar for Image & PDF Controls */}
        {isPdf && !pdfFallbackToIframe && (
          <div className="px-5 py-2 bg-gray-50/90 border-b border-gray-200/80 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 shrink-0">
            {/* Page Navigation */}
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="p-1.5 hover:bg-white disabled:opacity-30 rounded-lg border border-transparent hover:border-gray-200 transition-colors cursor-pointer text-gray-700"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-gray-700 px-1">
                Page <span className="text-blue-600">{currentPage}</span> of {totalPages || 1}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="p-1.5 hover:bg-white disabled:opacity-30 rounded-lg border border-transparent hover:border-gray-200 transition-colors cursor-pointer text-gray-700"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-gray-200/80 shadow-2xs">
              <button
                onClick={() => setPdfZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(1))))}
                className="p-1 hover:bg-gray-100 rounded-md text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                title="Zoom Out (-20%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono font-semibold text-gray-700 min-w-[44px] text-center text-[11px]">
                {Math.round(pdfZoom * 100)}%
              </span>
              <button
                onClick={() => setPdfZoom((z) => Math.min(3.5, Number((z + 0.2).toFixed(1))))}
                className="p-1 hover:bg-gray-100 rounded-md text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                title="Zoom In (+20%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-3.5 w-px bg-gray-200 mx-1" />
              <button
                onClick={() => {
                  setPdfZoom(1.0);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-2 py-0.5 hover:bg-gray-100 rounded-md font-semibold text-[11px] text-gray-600 transition-colors cursor-pointer flex items-center gap-1"
                title="Reset zoom to 100%"
              >
                <Maximize className="w-3 h-3 text-gray-500" />
                <span>Fit</span>
              </button>
            </div>

            {/* Rotation Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPdfRotation((r) => (r + 270) % 360)}
                className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 flex items-center gap-1 font-semibold text-gray-600 transition-colors cursor-pointer"
                title="Rotate 90° counter-clockwise"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPdfRotation((r) => (r + 90) % 360)}
                className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 flex items-center gap-1 font-semibold text-gray-600 transition-colors cursor-pointer"
                title="Rotate 90° clockwise"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rotate</span>
              </button>
            </div>
          </div>
        )}

        {isImage && (
          <div className="px-5 py-2 bg-gray-50/90 border-b border-gray-200/80 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 shrink-0">
            {/* Image Zoom */}
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-gray-200/80 shadow-2xs">
              <button
                onClick={() => setImageZoom((z) => Math.max(0.2, Number((z - 0.2).toFixed(1))))}
                className="p-1 hover:bg-gray-100 rounded-md text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono font-semibold text-gray-700 min-w-[44px] text-center text-[11px]">
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                onClick={() => setImageZoom((z) => Math.min(4, Number((z + 0.2).toFixed(1))))}
                className="p-1 hover:bg-gray-100 rounded-md text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-3.5 w-px bg-gray-200 mx-1" />
              <button
                onClick={resetPanAndZoom}
                className="px-2 py-0.5 hover:bg-gray-100 rounded-md font-semibold text-[11px] text-gray-600 transition-colors cursor-pointer flex items-center gap-1"
                title="Reset zoom & position"
              >
                <Maximize className="w-3 h-3 text-gray-500" />
                <span>Fit</span>
              </button>
            </div>

            {/* Rotation Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setImageRotation((r) => (r + 270) % 360)}
                className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 flex items-center gap-1 font-semibold text-gray-600 transition-colors cursor-pointer"
                title="Rotate 90° counter-clockwise"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setImageRotation((r) => (r + 90) % 360)}
                className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 flex items-center gap-1 font-semibold text-gray-600 transition-colors cursor-pointer"
                title="Rotate 90° clockwise"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rotate</span>
              </button>
            </div>
          </div>
        )}

        {isTextOrCode && textContent !== null && (
          <div className="px-6 py-2 bg-gray-50 border-b border-gray-200/80 flex items-center justify-between text-xs text-gray-600 shrink-0">
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter lines..."
                  value={codeFilter}
                  onChange={(e) => setCodeFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 bg-white border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-mono">{textContent.split('\n').length} lines</span>
              <button
                onClick={handleCopyCode}
                className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                <span>{copied ? 'Copied' : 'Copy All'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          className={`flex-1 overflow-hidden p-4 bg-gray-100/70 flex items-center justify-center relative select-none ${
            isImage || (isPdf && !pdfFallbackToIframe)
              ? isDragging
                ? 'cursor-grabbing'
                : 'cursor-grab'
              : ''
          }`}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400 text-xs font-medium">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>Rendering document preview...</span>
            </div>
          ) : error ? (
            <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-3 max-w-md shadow-xs">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">Failed to load preview</p>
                <p className="text-red-600/80">{error}</p>
              </div>
            </div>
          ) : isPdf && downloadUrl ? (
            pdfFallbackToIframe ? (
              <div className="w-full h-full rounded-2xl overflow-hidden shadow-md border border-gray-200 bg-white">
                <iframe
                  src={`${downloadUrl}#view=FitH`}
                  className="w-full h-full border-0"
                  title={file.name}
                />
              </div>
            ) : (
              <div
                className="transition-transform duration-75 flex items-center justify-center"
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                }}
              >
                <div className="relative bg-white shadow-2xl rounded-xl border border-gray-300 overflow-hidden flex items-center justify-center">
                  {pdfRendering && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-2xs flex items-center justify-center z-10">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="block mx-auto max-w-none pointer-events-none" />
                </div>
              </div>
            )
          ) : isImage && downloadUrl ? (
            <div
              className="transition-transform duration-75 flex items-center justify-center"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              }}
            >
              <img
                src={downloadUrl}
                alt={file.name}
                crossOrigin="anonymous"
                draggable={false}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  setImageDimensions({ width: target.naturalWidth, height: target.naturalHeight });
                }}
                onError={() => {
                  setError('Image format could not be decoded. You can download the file directly.');
                }}
                style={{
                  transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                }}
                className="max-h-[72vh] max-w-[85vw] object-contain rounded-xl shadow-2xl border border-gray-200 bg-white pointer-events-none"
              />
            </div>
          ) : isCsv && csvRows && csvRows.length > 0 ? (
            <div className="w-full h-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-auto">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead className="bg-gray-100/80 sticky top-0 border-b border-gray-200 font-bold text-gray-700 shadow-2xs">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-gray-200 w-12 text-center text-gray-400">#</th>
                    {csvRows[0].map((header, idx) => (
                      <th key={idx} className="py-2.5 px-4 border-r border-gray-200 whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-600 font-medium">
                  {csvRows.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-2 px-3 border-r border-gray-100 text-center font-mono text-gray-400 bg-gray-50/50">
                        {rowIdx + 1}
                      </td>
                      {row.map((cell, colIdx) => (
                        <td key={colIdx} className="py-2 px-4 border-r border-gray-100 whitespace-nowrap">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isTextOrCode && textContent !== null ? (
            <div className="w-full h-full bg-gray-950 text-gray-200 rounded-2xl p-4 font-mono text-xs overflow-auto shadow-inner border border-gray-800">
              <div className="flex">
                <div className="select-none pr-4 text-gray-600 text-right font-mono border-r border-gray-800 shrink-0">
                  {(codeFilter ? filteredLines : textContent.split('\n')).map((_, idx) => (
                    <div key={idx} className="leading-6">
                      {idx + 1}
                    </div>
                  ))}
                </div>
                <div className="pl-4 flex-1 overflow-x-auto">
                  {(codeFilter ? filteredLines : textContent.split('\n')).map((line, idx) => (
                    <div key={idx} className="leading-6 whitespace-pre font-mono hover:bg-gray-900/60 px-1 rounded-sm">
                      {line || ' '}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : isVideo && downloadUrl ? (
            <div className="w-full max-w-3xl max-h-[65vh] rounded-2xl overflow-hidden shadow-xl border border-gray-200 bg-black flex items-center justify-center">
              <video src={downloadUrl} controls className="max-h-[60vh] max-w-full" autoPlay={false} />
            </div>
          ) : isAudio && downloadUrl ? (
            <div className="p-8 bg-white rounded-3xl border border-gray-200 shadow-xl max-w-md w-full text-center space-y-4">
              <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xs">
                <Music className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-base">{file.name}</h4>
                <p className="text-xs text-gray-400 mt-1">Audio Recording</p>
              </div>
              <audio src={downloadUrl} controls className="w-full pt-2" />
            </div>
          ) : isOfficeDoc && downloadUrl ? (
            <div className="p-8 bg-white rounded-3xl border border-gray-200 shadow-lg max-w-md w-full text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 border border-blue-200 rounded-3xl flex items-center justify-center mx-auto text-blue-600 shadow-2xs">
                <FileText className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-gray-900 text-base">{file.name}</h4>
                <p className="text-xs text-gray-500">
                  Microsoft Office {ext.toUpperCase()} document stored securely in CloudStore.
                </p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-bold rounded-full text-xs transition-all shadow-2xs flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4 text-gray-500" />
                  <span>Open in Tab</span>
                </a>
                <a
                  href={`${downloadUrl}&download=true`}
                  download={file.name}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full text-xs transition-all shadow-2xs flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Document</span>
                </a>
              </div>
            </div>
          ) : downloadUrl ? (
            <div className="text-center py-12 space-y-4 max-w-md bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
              <div className="w-16 h-16 bg-blue-50 border border-blue-200 rounded-3xl flex items-center justify-center mx-auto text-blue-600 shadow-2xs">
                <FileText className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-gray-900 text-sm">{file.name}</h4>
                <p className="text-xs text-gray-500">
                  File verified and indexed in storage. Open directly in a new tab or download.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center gap-3">
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-bold rounded-full text-xs transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-gray-500" />
                  <span>Open in Tab</span>
                </a>
                <a
                  href={`${downloadUrl}&download=true`}
                  download={file.name}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full text-xs transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 text-xs">Preview unavailable.</div>
          )}
        </div>

        {/* Footer Info */}
        <div className="px-6 py-3 border-t border-gray-100 bg-white flex items-center justify-between text-xs text-gray-400 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate max-w-xs sm:max-w-md font-mono text-[11px] text-gray-500">{file.s3StorageKey}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-full text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
