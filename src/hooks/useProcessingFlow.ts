'use client';

import { useState, useCallback } from 'react';
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

  const processFile = useCallback(async (
    file: File,
    mode: ExtractionMode = 'language',
    languages: string[] = ['en']
  ): Promise<ProcessingResult | null> => {
    const BATCH_SIZE = 2; // Reduced to 2 pages to ensure completion within 60s timeout
    const processStartTime = Date.now();
    const batchTimes: number[] = [];

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

      // Phase 2: Process pages in batches (OCR)
      for (let start = 1; start <= totalPages; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE - 1, totalPages);
        const currentBatch = Math.ceil(start / BATCH_SIZE);
        const totalBatches = Math.ceil(totalPages / BATCH_SIZE);

        const processLabel = fileType === 'image' ? 'image' : fileType === 'epub' ? 'chapters' : 'pages';
        const elapsedTime = Date.now() - processStartTime;

        // Calculate estimated time remaining based on average batch time
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

        const processResponse = await fetchWithRetry(
          `/api/jobs/${jobId}/process`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startPage: start, endPage: end, languages }),
          },
          { maxRetries: 2, timeoutMs: 300000 }
        );

        // Check if response is JSON (timeout errors return HTML)
        const contentType = processResponse.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          throw new Error('Server timeout - please try again with a smaller file');
        }

        const processData = await processResponse.json();

        if (!processData.success) {
          throw new Error(processData.error || 'Failed to process pages');
        }

        // Track batch timing from API response
        if (processData.data?.batchTimeMs) {
          batchTimes.push(processData.data.batchTimeMs);
        }
      }

      setState(prev => ({
        ...prev,
        phase: 'ocr',
        progress: totalPages,
        total: totalPages,
        message: 'OCR complete',
        elapsedTime: Date.now() - processStartTime,
      }));

      // Phase 3: Extract vocabulary/concepts in batches
      const extractLabel = mode === 'concept' ? 'concepts' : 'vocabulary';
      
      // First, get the total number of chunks
      setState(prev => ({
        ...prev,
        phase: 'extracting',
        progress: 0,
        total: 1,
        message: `Preparing to extract ${extractLabel}...`,
        elapsedTime: Date.now() - processStartTime,
        currentBatch: undefined,
        totalBatches: undefined,
        lastBatchTime: undefined,
        estimatedTimeRemaining: undefined,
      }));

      const chunksResponse = await fetch(`/api/jobs/${jobId}/chunks`);
      const chunksData = await chunksResponse.json();

      if (!chunksData.success) {
        throw new Error(chunksData.error || 'Failed to get chunk count');
      }

      const totalChunks = chunksData.data.totalChunks;
      const extractionChunkTimes: number[] = [];
      let totalEntriesFound = 0;

      // Process each chunk
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const elapsedTime = Date.now() - processStartTime;

        // Calculate estimated time remaining
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

        // Check if response is JSON
        const contentType = chunkResponse.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          throw new Error('Server timeout during extraction - please try again');
        }

        const chunkData = await chunkResponse.json();

        if (!chunkData.success) {
          throw new Error(chunkData.error || `Failed to extract chunk ${chunkIndex + 1}`);
        }

        // Track timing and entries
        if (chunkData.data?.chunkTimeMs) {
          extractionChunkTimes.push(chunkData.data.chunkTimeMs);
        }
        totalEntriesFound = chunkData.data?.totalEntries || totalEntriesFound;
      }

      const foundLabel = mode === 'concept' ? 'concept' : 'vocabulary';
      setState(prev => ({
        ...prev,
        phase: 'extracting',
        progress: totalChunks,
        total: totalChunks,
        message: `Found ${totalEntriesFound} ${foundLabel} entries`,
        elapsedTime: Date.now() - processStartTime,
      }));

      // Phase 4: Finalize
      setState(prev => ({
        ...prev,
        phase: 'finalizing',
        progress: 0,
        total: 1,
        message: 'Generating CSV file...',
        elapsedTime: Date.now() - processStartTime,
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
      setState({
        phase: 'complete',
        progress: 1,
        total: 1,
        message: `Successfully extracted ${finalizeData.data.vocabularyCount} ${completeLabel} entries!`,
        jobId,
        extractionMode: mode,
        elapsedTime: Date.now() - processStartTime,
        totalTimeFormatted,
      });

      return {
        jobId,
        vocabularyCount: finalizeData.data.vocabularyCount,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
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
    reset,
    downloadCsv,
    downloadFlashcards,
    isProcessing: !['idle', 'complete', 'error'].includes(state.phase),
    isComplete: state.phase === 'complete',
    hasError: state.phase === 'error',
  };
}
