'use client';

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

interface ProcessingStatusProps {
  phase: string;
  progress: number;
  total: number;
  message?: string;
  error?: string;
  stoppedEarly?: boolean;
  onStop?: () => void;
  isStopping?: boolean;
  // Timing data
  elapsedTime?: number;
  estimatedTimeRemaining?: number;
  currentBatch?: number;
  totalBatches?: number;
  lastBatchTime?: number;
  totalTimeFormatted?: string;
}

export function ProcessingStatus({
  phase,
  progress,
  total,
  message,
  error,
  stoppedEarly,
  onStop,
  isStopping,
  elapsedTime,
  estimatedTimeRemaining,
  currentBatch,
  totalBatches,
  lastBatchTime,
  totalTimeFormatted,
}: ProcessingStatusProps) {
  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;

  const getPhaseLabel = (phase: string): string => {
    switch (phase) {
      case 'uploading':
        return 'Uploading file...';
      case 'converting':
        return 'Converting pages...';
      case 'ocr':
        return 'Running OCR...';
      case 'ocr_complete':
        return 'OCR complete';
      case 'extracting':
        return 'Extracting vocabulary...';
      case 'extraction_complete':
        return 'Vocabulary extracted';
      case 'finalizing':
        return 'Generating CSV...';
      case 'complete':
        return 'Complete!';
      case 'error':
        return 'Error';
      default:
        return phase;
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-white">{getPhaseLabel(phase)}</span>
        <span className="text-slate-400">{percentage}%</span>
      </div>

      <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            phase === 'error'
              ? 'bg-red-500'
              : phase === 'complete'
              ? 'bg-green-500'
              : 'progress-gradient'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {message && (
        <p className="text-sm text-slate-400">{message}</p>
      )}

      {/* Timing information during processing */}
      {phase !== 'complete' && phase !== 'error' && phase !== 'idle' && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          {/* Batch progress for OCR phase */}
          {phase === 'ocr' && currentBatch && totalBatches && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Batch {currentBatch} of {totalBatches}</span>
              {lastBatchTime && (
                <span className="text-slate-500">Last batch: {formatDuration(lastBatchTime)}</span>
              )}
            </div>
          )}

          {/* Chunk progress for extraction phase */}
          {phase === 'extracting' && currentBatch && totalBatches && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Chunk {currentBatch} of {totalBatches}</span>
            </div>
          )}

          {/* Elapsed time */}
          {elapsedTime !== undefined && elapsedTime > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Elapsed: <span className="font-medium text-white">{formatDuration(elapsedTime)}</span>
              </span>
              {/* Estimated time remaining */}
              {estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0 && (
                <span className="text-slate-400">
                  ~{formatDuration(estimatedTimeRemaining)} remaining
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {phase !== 'complete' && phase !== 'error' && phase !== 'idle' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 text-sm text-slate-400">
            <svg
              className="animate-spin h-4 w-4 text-indigo-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Processing... Please keep this tab open.</span>
          </div>

          {onStop && (phase === 'ocr' || phase === 'extracting') && (
            <button
              onClick={onStop}
              disabled={isStopping}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {isStopping ? 'Stopping...' : 'Stop & Get Results'}
            </button>
          )}
        </div>
      )}

      {phase === 'complete' && (
        <div className="space-y-3">
          <div className={`flex items-center space-x-2 text-sm ${stoppedEarly ? 'text-amber-400' : 'text-emerald-400'}`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>
              {stoppedEarly
                ? 'Partial results ready. Your CSV is ready to download.'
                : 'Processing complete! Your CSV is ready to download.'}
            </span>
          </div>
          {totalTimeFormatted && (
            <p className="text-xs text-slate-500">
              Total processing time: <span className="font-medium text-slate-400">{totalTimeFormatted}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
