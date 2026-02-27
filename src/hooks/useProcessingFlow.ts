'use client';

import { useState, useCallback, useRef } from 'react';
import type { ExtractionMode } from '@/types';

/**
 * Format milliseconds into human-readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  }
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Fetch with timeout and retry logic for handling long-running OCR requests
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  { maxRetries = 2, timeoutMs = 55000 }: { maxRetries?: number; timeoutMs?: number } = {}
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If we get a 504 or 502, retry
      if (response.status === 504 || response.status === 502) {
        lastError = new Error(`Server timeout (${response.status})`);
        if (attempt < maxRetries) {
          console.log(`Retrying request (attempt ${attempt + 2}/${maxRetries + 1})...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // If aborted due to timeout, retry
      if (lastError.name === 'AbortError' && attempt < maxRetries) {
        console.log(`Request timed out, retrying (attempt ${attempt + 2}/${maxRetries + 1})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      // For other errors, don't retry
      if (lastError.name !== 'AbortError') {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

interface ProcessingState {
  phase: 'idle' | 'uploading' | 'ocr' | 'extracting' | 'finalizing' | 'complete' | 'error';
  progress: number;
  total: number;
  message: string;
  error?: string;
  jobId?: string;
  extractionMode?: ExtractionMode;
  stoppedEarly?: boolean;
  // Timing data
  startTime?: number;
  elapsedTime?: number;
  estimatedTimeRemaining?: number;
  currentBatch?: number;
  totalBatches?: number;
  lastBatchTime?: number;
  totalTimeFormatted?: string;
}

interface ProcessingResult {
  jobId: string;
  vocabularyCount: number;
}

export function useProcessingFlow() {
  const [state, setState] = useState<ProcessingState>({
    phase: 'idle',
    progress: 0,
    total: 0,
    message: '',
  });
  const [isStopping, setIsStopping] = useState(false);
  const stopRequestedRef = useRef(false);

  const stopProcessing = useCallback(() => {
    stopRequestedRef.current = true;
    setIsStopping(true);
  }, []);

  const processFile = useCallback(async (
    file: File,
    mode: ExtractionMode = 'language',
    languages: string[] = ['en']
  ): Promise<ProcessingResult | null> => {
    const BATCH_SIZE = 2;
    const processStartTime = Date.now();
    const batchTimes: number[] = [];
    let stoppedEarly = false;

    stopRequestedRef.current = false;
    setIsStopping(false);

    try {
      // Phase 1: Upload file
      setState({
        phase: 'uploading',
        progress: 0,
        total: 1,
        message: 'Uploading file...',
        extractionMode: mode,
        startTime: processStartTime,
        elapsedTime: 0,
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);

      const uploadResponse = await fetch('/api/jobs', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        // Handle page limit exceeded error specially
        if (uploadData.error === 'page_limit_exceeded' && uploadData.details) {
          throw new Error(uploadData.details.message || 'Page limit exceeded. Please upgrade your plan.');
        }
        throw new Error(uploadData.error || 'Failed to upload file');
      }

      const { jobId, totalPages, fileType } = uploadData.data;

      const itemLabel = fileType === 'epub' ? 'chapters' : fileType === 'image' ? 'image' : 'pages';
      setState({
        phase: 'uploading',
        progress: 1,
        total: 1,
        message: `Uploaded ${file.name} (${totalPages} ${itemLabel})`,
        jobId,
      });

      // Phase 2: Process pages in batches (OCR) using fire-and-forget + polling
      for (let start = 1; start <= totalPages; start += BATCH_SIZE) {
        if (stopRequestedRef.current) break;

        const end = Math.min(start + BATCH_SIZE - 1, totalPages);
        const currentBatch = Math.ceil(start / BATCH_SIZE);
        const totalBatches = Math.ceil(totalPages / BATCH_SIZE);
        const batchStartTime = Date.now();

        const processLabel = fileType === 'image' ? 'image' : fileType === 'epub' ? 'chapters' : 'pages';
        const elapsedTime = Date.now() - processStartTime;

        const avgBatchTime = batchTimes.length > 0
          ? batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length
          : 0;
        const remainingBatches = totalBatches - currentBatch + 1;
        const estimatedTimeRemaining = avgBatchTime > 0 ? avgBatchTime * remainingBatches : undefined;

        setState(prev => ({
          ...prev,
          phase: 'ocr',
          progress: start - 1,
          total: totalPages,
          message: fileType === 'image'
            ? 'Processing image with OCR...'
            : `Processing ${processLabel} ${start}-${end} of ${totalPages}...`,
          elapsedTime,
          currentBatch,
          totalBatches,
          lastBatchTime: batchTimes.length > 0 ? batchTimes[batchTimes.length - 1] : undefined,
          estimatedTimeRemaining,
        }));

        // Fire-and-forget: kick off batch, server returns 202 instantly
        const processResponse = await fetch(`/api/jobs/${jobId}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startPage: start, endPage: end, languages }),
        });

        if (!processResponse.ok) {
          const errData = await processResponse.json().catch(() => null);
          throw new Error(errData?.error || 'Failed to start batch processing');
        }

        // Poll status until this batch completes
        let batchDone = false;
        while (!batchDone) {
          await new Promise(resolve => setTimeout(resolve, 3000));

          if (stopRequestedRef.current) break;

          const statusResponse = await fetch(`/api/jobs/${jobId}/status`);
          const statusData = await statusResponse.json();

          if (!statusData.success) continue;

          if (statusData.data.status === 'failed') {
            throw new Error(statusData.data.error || 'Processing failed');
          }

          setState(prev => ({
            ...prev,
            elapsedTime: Date.now() - processStartTime,
          }));

          if (statusData.data.pagesProcessed >= end) {
            batchTimes.push(Date.now() - batchStartTime);
            batchDone = true;
          }
        }

        if (stopRequestedRef.current) break;
      }

      if (stopRequestedRef.current) {
        stoppedEarly = true;
        stopRequestedRef.current = false;
        setState(prev => ({
          ...prev,
          message: 'Stopping... extracting vocabulary from processed pages...',
          elapsedTime: Date.now() - processStartTime,
          estimatedTimeRemaining: undefined,
        }));
      } else {
        setState(prev => ({
          ...prev,
          phase: 'ocr',
          progress: totalPages,
          total: totalPages,
          message: 'OCR complete',
          elapsedTime: Date.now() - processStartTime,
        }));
      }

      // Phase 3: Extract vocabulary/concepts in batches
      const extractLabel = mode === 'concept' ? 'concepts' : 'vocabulary';

      setState(prev => ({
        ...prev,
        phase: 'extracting',
        progress: 0,
        total: 1,
        message: stoppedEarly
          ? `Extracting ${extractLabel} from processed pages...`
          : `Preparing to extract ${extractLabel}...`,
        elapsedTime: Date.now() - processStartTime,
        currentBatch: undefined,
        totalBatches: undefined,
        lastBatchTime: undefined,
        estimatedTimeRemaining: undefined,
      }));

      const chunksResponse = await fetch(`/api/jobs/${jobId}/chunks`);
      const chunksData = await chunksResponse.json();

      if (!chunksData.success) {
        if (stoppedEarly) {
          setIsStopping(false);
          setState({
            phase: 'error',
            progress: 0,
            total: 0,
            message: 'Not enough content was processed to extract results.',
            error: 'Processing was stopped before any pages were fully processed. Try processing more pages.',
            jobId,
            stoppedEarly: true,
          });
          return null;
        }
        throw new Error(chunksData.error || 'Failed to get chunk count');
      }

      const totalChunks = chunksData.data.totalChunks;
      const extractionChunkTimes: number[] = [];
      let totalEntriesFound = 0;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (stopRequestedRef.current) break;

        const elapsedTime = Date.now() - processStartTime;

        const avgChunkTime = extractionChunkTimes.length > 0
          ? extractionChunkTimes.reduce((a, b) => a + b, 0) / extractionChunkTimes.length
          : 0;
        const remainingChunks = totalChunks - chunkIndex;
        const estimatedTimeRemaining = avgChunkTime > 0 ? avgChunkTime * remainingChunks : undefined;

        setState(prev => ({
          ...prev,
          phase: 'extracting',
          progress: chunkIndex,
          total: totalChunks,
          message: `Extracting ${extractLabel}: chunk ${chunkIndex + 1} of ${totalChunks}...`,
          elapsedTime,
          currentBatch: chunkIndex + 1,
          totalBatches: totalChunks,
          lastBatchTime: extractionChunkTimes.length > 0 ? extractionChunkTimes[extractionChunkTimes.length - 1] : undefined,
          estimatedTimeRemaining,
        }));

        const chunkResponse = await fetchWithRetry(
          `/api/jobs/${jobId}/extract-chunk`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chunkIndex }),
          },
          { maxRetries: 2, timeoutMs: 300000 }
        );

        const contentType = chunkResponse.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          throw new Error('Server timeout during extraction - please try again');
        }

        const chunkData = await chunkResponse.json();

        if (!chunkData.success) {
          throw new Error(chunkData.error || `Failed to extract chunk ${chunkIndex + 1}`);
        }

        if (chunkData.data?.chunkTimeMs) {
          extractionChunkTimes.push(chunkData.data.chunkTimeMs);
        }
        totalEntriesFound = chunkData.data?.totalEntries || totalEntriesFound;
      }

      if (stopRequestedRef.current) {
        stoppedEarly = true;
        stopRequestedRef.current = false;
      }

      // Check if there's any vocabulary to finalize
      const statusCheck = await fetch(`/api/jobs/${jobId}/status`);
      const statusCheckData = await statusCheck.json();
      const vocabCount = statusCheckData.data?.vocabularyCount ?? 0;

      if (vocabCount === 0 && stoppedEarly) {
        setIsStopping(false);
        setState({
          phase: 'error',
          progress: 0,
          total: 0,
          message: 'Not enough content was processed to extract results.',
          error: 'No vocabulary entries were found in the processed pages. Try processing more pages or a different file.',
          jobId,
          stoppedEarly: true,
        });
        return null;
      }

      if (!stoppedEarly) {
        const foundLabel = mode === 'concept' ? 'concept' : 'vocabulary';
        setState(prev => ({
          ...prev,
          phase: 'extracting',
          progress: totalChunks,
          total: totalChunks,
          message: `Found ${totalEntriesFound} ${foundLabel} entries`,
          elapsedTime: Date.now() - processStartTime,
        }));
      }

      // Phase 4: Finalize
      setState(prev => ({
        ...prev,
        phase: 'finalizing',
        progress: 0,
        total: 1,
        message: stoppedEarly ? 'Generating partial results...' : 'Generating CSV file...',
        elapsedTime: Date.now() - processStartTime,
        estimatedTimeRemaining: undefined,
      }));

      const finalizeResponse = await fetch(`/api/jobs/${jobId}/finalize`, {
        method: 'POST',
      });

      const finalizeData = await finalizeResponse.json();

      if (!finalizeData.success) {
        throw new Error(finalizeData.error || 'Failed to generate CSV');
      }

      // Complete!
      const completeLabel = mode === 'concept' ? 'concept' : 'vocabulary';
      const totalTimeFormatted = finalizeData.data.totalTimeFormatted || formatDuration(Date.now() - processStartTime);

      setIsStopping(false);
      setState({
        phase: 'complete',
        progress: 1,
        total: 1,
        message: stoppedEarly
          ? `Partial results: extracted ${finalizeData.data.vocabularyCount} ${completeLabel} entries`
          : `Successfully extracted ${finalizeData.data.vocabularyCount} ${completeLabel} entries!`,
        jobId,
        extractionMode: mode,
        stoppedEarly,
        elapsedTime: Date.now() - processStartTime,
        totalTimeFormatted,
      });

      return {
        jobId,
        vocabularyCount: finalizeData.data.vocabularyCount,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setIsStopping(false);
      setState(prev => ({
        ...prev,
        phase: 'error',
        error: errorMessage,
        message: 'Processing failed',
      }));
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      phase: 'idle',
      progress: 0,
      total: 0,
      message: '',
    });
  }, []);

  const downloadCsv = useCallback(async (format: 'anki' | 'excel' = 'anki') => {
    if (!state.jobId) return;

    const response = await fetch(`/api/jobs/${state.jobId}/download?format=${format}`);

    if (!response.ok) {
      throw new Error('Failed to download CSV');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabulary_${state.jobId}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, [state.jobId]);

  const downloadFlashcards = useCallback(async () => {
    if (!state.jobId) return;

    const response = await fetch(`/api/jobs/${state.jobId}/flashcards`);

    if (!response.ok) {
      throw new Error('Failed to download flashcards');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcards_${state.jobId}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, [state.jobId]);

  return {
    state,
    processFile,
    stopProcessing,
    isStopping,
    reset,
    downloadCsv,
    downloadFlashcards,
    isProcessing: !['idle', 'complete', 'error'].includes(state.phase),
    isComplete: state.phase === 'complete',
    hasError: state.phase === 'error',
  };
}
