import React, { useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ExternalLink, FileText, Image as ImageIcon, ZoomIn, ZoomOut } from 'lucide-react';
import { readStorageBytes, resolveStorageUrl } from '../local/fileStorage.ts';
import { Button } from './ui/Primitives.tsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function useStorageUrl(relPath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdBlobUrl: string | null = null;
    if (!relPath) {
      setUrl(null);
      return;
    }
    resolveStorageUrl(relPath)
      .then((resolved) => {
        if (!active) {
          if (resolved?.startsWith('blob:')) URL.revokeObjectURL(resolved);
          return;
        }
        if (resolved?.startsWith('blob:')) createdBlobUrl = resolved;
        setUrl(resolved);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
    };
  }, [relPath]);

  return url;
}

export function LocalAudioPlayer({ audioPath }: { audioPath: string }) {
  const url = useStorageUrl(audioPath);
  if (!url) {
    return <div className="text-xs text-slate-400">Loading audio from device storage...</div>;
  }
  return <audio controls src={url} className="w-full h-9" />;
}

export function LocalStorageLink({
  pathOrUrl,
  label,
  className = '',
}: {
  pathOrUrl: string;
  label?: string;
  className?: string;
}) {
  const isRemote = /^https?:\/\//i.test(pathOrUrl);
  const url = useStorageUrl(isRemote ? null : pathOrUrl);
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(pathOrUrl) || pathOrUrl.startsWith('photos/');
  const [previewOpen, setPreviewOpen] = useState(false);

  if (isRemote) {
    return (
      <a
        href={pathOrUrl}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline ${className}`}
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{label || pathOrUrl}</span>
      </a>
    );
  }

  async function handleOpenLocalFile() {
    if (Capacitor.isNativePlatform()) {
      try {
        const uriRes = await Filesystem.getUri({
          directory: Directory.Data,
          path: `bsc_storage/${pathOrUrl}`,
        });
        await Share.share({
          title: label || 'Local File',
          url: uriRes.uri,
        });
        return;
      } catch {
        // ignore if user dismisses share sheet
      }
    }
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => (isImage ? setPreviewOpen((v) => !v) : handleOpenLocalFile())}
        className={`inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ${className}`}
      >
        {isImage ? <ImageIcon className="w-3.5 h-3.5 shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}
        <span className="truncate">{label || 'Open local file'}</span>
      </button>
      {isImage && previewOpen && url && (
        <div className="pt-1">
          <img
            src={url}
            alt={label || 'Saved local image'}
            className="max-h-64 rounded-lg border border-slate-200 dark:border-slate-700 object-contain"
          />
        </div>
      )}
    </div>
  );
}

export function LocalPdfViewer({
  storagePath,
  initialPage = 1,
  onPageChange,
}: {
  storagePath: string;
  initialPage?: number;
  onPageChange?: (page: number, totalPages: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(Math.max(1, initialPage || 1));
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    setLoading(true);
    setError('');

    readStorageBytes(storagePath)
      .then(async (bytes) => {
        if (cancelled) return;
        if (!bytes) throw new Error('PDF file not found in device storage.');
        loadingTask = pdfjsLib.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setPageNum((prev) => Math.min(Math.max(1, prev), doc.numPages));
        setLoading(false);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message || 'Unable to load PDF.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      loadingTask?.destroy().catch(() => undefined);
      pdfDocRef.current?.destroy().catch(() => undefined);
      pdfDocRef.current = null;
    };
  }, [storagePath]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    async function renderPage() {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      const page = await doc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      renderTask = page.render({ canvasContext: ctx, viewport, canvas });
      await renderTask.promise;
      if (!cancelled) {
        onPageChange?.(pageNum, doc.numPages);
      }
    }

    if (!loading && !error && pdfDocRef.current) {
      renderPage().catch(() => undefined);
    }

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNum, scale, loading, error]);

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <Button size="sm" disabled={pageNum <= 1} onClick={() => setPageNum((p) => Math.max(1, p - 1))}>
            ← Prev
          </Button>
          <span className="text-xs font-mono tabular-nums px-2">
            Page {pageNum} / {totalPages || '—'}
          </span>
          <Button
            size="sm"
            disabled={totalPages > 0 && pageNum >= totalPages}
            onClick={() => setPageNum((p) => (totalPages > 0 ? Math.min(totalPages, p + 1) : p + 1))}
          >
            Next →
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.2).toFixed(2))))}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button size="sm" onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.2).toFixed(2))))}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-950 overflow-auto max-h-[540px] flex justify-center p-2">
        {loading ? (
          <div className="py-16 text-xs text-slate-500">Rendering PDF from device storage...</div>
        ) : (
          <canvas ref={canvasRef} className="shadow-sm bg-white max-w-full h-auto" />
        )}
      </div>
    </div>
  );
}

export function LocalEpubViewer({
  storagePath,
  initialLocation,
  onLocationChange,
}: {
  storagePath: string;
  initialLocation: string | null;
  onLocationChange: (cfi: string, percentage: number) => void;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!viewerRef.current) return;
    let destroyed = false;
    let epubBook: any = null;

    readStorageBytes(storagePath)
      .then((bytes) => {
        if (destroyed) return;
        if (!bytes) throw new Error('EPUB file not found in device storage.');
        const buf: ArrayBuffer = new Uint8Array(bytes).buffer;
        epubBook = ePub(buf);
        const rendition = epubBook.renderTo(viewerRef.current!, {
          width: '100%',
          height: 520,
          spread: 'none',
        });
        renditionRef.current = rendition;

        epubBook.ready
          .then(() => epubBook.locations.generate(1024))
          .then(() => {
            if (!destroyed) {
              return rendition.display(initialLocation || undefined);
            }
          })
          .catch((err: any) => {
            if (!destroyed) setError(err?.message || 'Unable to render EPUB file in viewer.');
          });

        rendition.on('relocated', (loc: any) => {
          const cfi = loc?.start?.cfi;
          const pct = epubBook.locations.percentageFromCfi(cfi);
          if (cfi) {
            onLocationChange(cfi, Math.round((pct || 0) * 100));
          }
        });
      })
      .catch((err: any) => {
        if (!destroyed) setError(err?.message || 'Unable to read EPUB file.');
      });

    return () => {
      destroyed = true;
      try {
        epubBook?.destroy();
      } catch {
        // ignore cleanup
      }
    };
  }, [storagePath]);

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={() => renditionRef.current?.prev()}>
          ← Previous Page
        </Button>
        <span className="text-xs text-slate-500">EPUB Reader (position saved offline)</span>
        <Button size="sm" onClick={() => renditionRef.current?.next()}>
          Next Page →
        </Button>
      </div>
      <div
        ref={viewerRef}
        className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white overflow-hidden min-h-[520px]"
      />
    </div>
  );
}
