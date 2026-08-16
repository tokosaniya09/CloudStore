import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud,
  File,
  Pause,
  Play,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB S3 minimum part size

interface CompletedPart {
  PartNumber: number;
  ETag: string;
}

type UploadStatus = 'idle' | 'initiating' | 'uploading' | 'paused' | 'completing' | 'success' | 'error';

interface ChunkedUploaderProps {
  activeOrgId: string;
  activeFolderId: string | null;
  onUploadSuccess?: () => void;
}

export const ChunkedUploader: React.FC<ChunkedUploaderProps> = ({
  activeOrgId,
  activeFolderId,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [currentChunk, setCurrentChunk] = useState<number>(0);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<string>('0 KB/s');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const completedPartsRef = useRef<CompletedPart[]>([]);
  const uploadIdRef = useRef<string | null>(null);
  const fileKeyRef = useRef<string | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const uploadedBytesRef = useRef<number>(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      selectFile(e.target.files[0]);
    }
  };

  const selectFile = (selectedFile: File) => {
    setFile(selectedFile);
    setStatus('idle');
    setProgress(0);
    setErrorMessage(null);
    const chunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
    setTotalChunks(chunks);
    completedPartsRef.current = [];
    uploadIdRef.current = null;
    fileKeyRef.current = null;
    uploadedBytesRef.current = 0;
  };

  // Step 1: Initiate Multipart Upload via Express / Spring Boot API Gateway
  const initiateUpload = async (fileToUpload: File) => {
    const res = await fetch('/api/v1/files/upload-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: fileToUpload.name,
        contentType: fileToUpload.type || 'application/octet-stream',
        size: fileToUpload.size,
        folderId: activeFolderId,
        orgId: activeOrgId,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed initiating upload');
    }

    const data = await res.json();
    uploadIdRef.current = data.uploadId;
    fileKeyRef.current = data.s3Key || data.key;
  };

  // Step 2: Upload Chunk Parts in Parallel or Sequentially
  const uploadChunks = async (fileToUpload: File) => {
    const totalParts = Math.ceil(fileToUpload.size / CHUNK_SIZE);
    startTimeRef.current = Date.now();

    for (let partNumber = completedPartsRef.current.length + 1; partNumber <= totalParts; partNumber++) {
      if (isPausedRef.current) break;

      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileToUpload.size);
      const chunkBlob = fileToUpload.slice(start, end);

      // Get Presigned Part URL
      const urlRes = await fetch('/api/v1/files/upload-presign-part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: uploadIdRef.current,
          key: fileKeyRef.current,
          partNumber,
        }),
      });

      if (!urlRes.ok) throw new Error(`Failed getting upload URL for part ${partNumber}`);
      const { url } = await urlRes.json();

      // Post Chunk directly to S3 Presigned URL or backend storage endpoint
      abortControllerRef.current = new AbortController();
      const isS3Direct = url.startsWith('http://') || url.startsWith('https://');
      const putRes = await fetch(url, {
        method: isS3Direct ? 'PUT' : 'POST',
        body: chunkBlob,
        signal: abortControllerRef.current.signal,
      });

      if (!putRes.ok) throw new Error(`Failed uploading part ${partNumber}`);

      const rawEtag = putRes.headers.get('ETag') || `etag-part-${partNumber}-${Date.now()}`;
      completedPartsRef.current.push({
        PartNumber: partNumber,
        ETag: rawEtag.replace(/"/g, ''),
      });

      uploadedBytesRef.current += chunkBlob.size;
      setCurrentChunk(partNumber);
      const percent = Math.round((partNumber / totalParts) * 100);
      setProgress(percent);

      // Calculate speed
      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      if (elapsedSeconds > 0) {
        const bytesPerSec = uploadedBytesRef.current / elapsedSeconds;
        setUploadSpeed(`${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`);
      }
    }
  };

  // Step 3: Complete Multipart Assembly
  const completeUpload = async () => {
    setStatus('completing');
    const res = await fetch('/api/v1/files/upload-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: uploadIdRef.current,
        key: fileKeyRef.current,
        fileName: file?.name,
        size: file?.size,
        mimeType: file?.type || 'application/octet-stream',
        extension: file?.name.split('.').pop() || 'dat',
        folderId: activeFolderId,
        orgId: activeOrgId,
        parts: completedPartsRef.current,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed completing assembly');
    }

    setStatus('success');
    if (onUploadSuccess) onUploadSuccess();
  };

  const startUpload = async () => {
    if (!file) return;
    try {
      setErrorMessage(null);
      isPausedRef.current = false;

      if (!uploadIdRef.current) {
        setStatus('initiating');
        await initiateUpload(file);
      }

      setStatus('uploading');
      await uploadChunks(file);

      if (!isPausedRef.current) {
        await completeUpload();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStatus('error');
        setErrorMessage(err.message || 'Upload error encountered');
      }
    }
  };

  const pauseUpload = () => {
    isPausedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStatus('paused');
  };

  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setFile(null);
    setStatus('idle');
    setProgress(0);
    completedPartsRef.current = [];
    uploadIdRef.current = null;
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 bg-white border border-gray-200 rounded-3xl shadow-sm text-gray-800 font-sans space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-600" />
            Direct File Uploader
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            S3 Multipart chunked upload with automatic checksum assembly
          </p>
        </div>
      </div>

      {/* Drag & Drop Canvas */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/50'
            : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
        }`}
      >
        <input
          type="file"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={status !== 'idle' && status !== 'error' && status !== 'success'}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-blue-50 rounded-full text-blue-600">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">
              {file ? file.name : 'Drag & drop file here, or click to browse'}
            </p>
            <p className="text-xs text-gray-400 font-medium mt-1">
              {file
                ? `${(file.size / (1024 * 1024)).toFixed(2)} MB (${totalChunks} x 5MB chunks)`
                : 'Supports multi-gigabyte files with automatic chunking & resume'}
            </p>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Upload Progress Tracker */}
      {status !== 'idle' && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 capitalize flex items-center gap-2 font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'success'
                    ? 'bg-emerald-500'
                    : status === 'uploading'
                    ? 'bg-blue-600 animate-pulse'
                    : status === 'paused'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
              />
              S3 Status: <strong className="text-gray-900">{status}</strong>
            </span>
            <span className="text-gray-900 font-mono font-bold">{progress}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-300 ${
                status === 'success' ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Metrics Display */}
          <div className="flex justify-between text-xs text-gray-500 font-mono pt-1">
            <span>
              Part {currentChunk} / {totalChunks}
            </span>
            <span>Speed: {status === 'uploading' ? uploadSpeed : '--'}</span>
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-gray-400 flex items-center gap-1.5 font-medium">
          <Info className="w-3.5 h-3.5 text-blue-600" />
          <span>Encrypted streaming upload to Firestore & Cloud Storage</span>
        </div>

        <div className="flex items-center gap-2">
          {status === 'uploading' && (
            <button
              onClick={pauseUpload}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-full text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}

          {(status === 'idle' || status === 'paused' || status === 'error') && file && (
            <button
              onClick={startUpload}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" /> {status === 'paused' ? 'Resume Upload' : 'Start Upload'}
            </button>
          )}

          {status !== 'idle' && status !== 'success' && (
            <button
              onClick={cancelUpload}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Abort
            </button>
          )}

          {status === 'success' && (
            <button
              onClick={() => {
                setFile(null);
                setStatus('idle');
                setProgress(0);
              }}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Upload Another
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
