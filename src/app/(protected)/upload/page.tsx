'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileUpload } from '@/components/FileUpload';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { useProcessingFlow } from '@/hooks/useProcessingFlow';
import type { ExtractionMode, SavedExportType } from '@/types';

interface Usage {
  tier: string;
  tierName: string;
  pagesUsed: number;
  pageLimit: number;
  pagesRemaining: number;
  percentUsed: number;
}

interface ExportUsage {
  tier: string;
  exportsUsed: number;
  exportLimit: number;
  exportsRemaining: number;
  canSave: boolean;
}

export default function UploadPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('language');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [exportUsage, setExportUsage] = useState<ExportUsage | null>(null);
  const [savingExport, setSavingExport] = useState<SavedExportType | null>(null);
  const [savedExports, setSavedExports] = useState<SavedExportType[]>([]);
  const { state, processFile, reset, downloadCsv, downloadFlashcards, isProcessing, isComplete, hasError } = useProcessingFlow();

  // Fetch usage on mount
  useEffect(() => {
    fetch('/api/subscription/usage')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setUsage(data.data);
        }
      })
      .catch(() => {
        // Ignore errors - usage display is optional
      });

    // Also fetch export usage
    fetch('/api/exports')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setExportUsage(data.data.usage);
        }
      })
      .catch(() => {});
  }, []);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleStartProcessing = async () => {
    if (!selectedFile) return;
    await processFile(selectedFile, extractionMode);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setSavedExports([]);
    reset();
  };

  const handleSaveExport = async (type: SavedExportType) => {
    if (!state.jobId) return;

    setSavingExport(type);

    try {
      const response = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: state.jobId,
          type,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSavedExports(prev => [...prev, type]);
        setExportUsage(data.data.usage);
      } else {
        alert(data.error || 'Failed to save export');
      }
    } catch {
      alert('Failed to save export');
    } finally {
      setSavingExport(null);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-black/50 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Vocab Extractor</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/exports"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              My Exports
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Usage Display */}
        {usage && (
          <div className="glass-card rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-300">
                    {usage.pagesUsed} / {usage.pageLimit === Infinity ? '∞' : usage.pageLimit} pages used
                  </span>
                  <span className="text-xs text-slate-500">{usage.tierName} plan</span>
                </div>
                {usage.pageLimit !== Infinity && (
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usage.percentUsed > 90 ? 'bg-red-500' :
                        usage.percentUsed > 70 ? 'bg-yellow-500' : 'progress-gradient'
                      }`}
                      style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {usage.percentUsed > 80 && usage.tier !== 'unlimited' && (
                <a
                  href="/pricing"
                  className="ml-4 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                >
                  Upgrade
                </a>
              )}
            </div>
          </div>
        )}

        <div className="glass-card rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-medium text-white">Upload your document</h2>
            <p className="mt-1 text-sm text-slate-400">
              Upload a PDF, EPUB, or image file to extract content for studying.
            </p>
          </div>

          {/* Extraction Mode Selector */}
          {!isProcessing && !isComplete && (
            <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
              <label className="text-sm font-medium text-slate-300 block mb-3">
                Extraction Mode
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  extractionMode === 'language'
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]'
                    : 'border-white/10 bg-slate-900/50 hover:border-white/20'
                }`}>
                  <input
                    type="radio"
                    name="extractionMode"
                    value="language"
                    checked={extractionMode === 'language'}
                    onChange={(e) => setExtractionMode(e.target.value as ExtractionMode)}
                    className="mt-1 accent-indigo-500"
                  />
                  <div>
                    <span className="font-medium text-white block">Language Learning</span>
                    <span className="text-sm text-slate-400">
                      Extract vocabulary with native script, romanization, and translations
                    </span>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  extractionMode === 'concept'
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]'
                    : 'border-white/10 bg-slate-900/50 hover:border-white/20'
                }`}>
                  <input
                    type="radio"
                    name="extractionMode"
                    value="concept"
                    checked={extractionMode === 'concept'}
                    onChange={(e) => setExtractionMode(e.target.value as ExtractionMode)}
                    className="mt-1 accent-indigo-500"
                  />
                  <div>
                    <span className="font-medium text-white block">Textbook Concepts</span>
                    <span className="text-sm text-slate-400">
                      Extract key terms, definitions, and concepts for studying
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* File upload */}
          {!isProcessing && !isComplete && (
            <FileUpload
              onFileSelect={handleFileSelect}
              disabled={isProcessing}
            />
          )}

          {/* Processing status */}
          {(isProcessing || isComplete || hasError) && (
            <ProcessingStatus
              phase={state.phase}
              progress={state.progress}
              total={state.total}
              message={state.message}
              error={state.error}
              elapsedTime={state.elapsedTime}
              estimatedTimeRemaining={state.estimatedTimeRemaining}
              currentBatch={state.currentBatch}
              totalBatches={state.totalBatches}
              lastBatchTime={state.lastBatchTime}
              totalTimeFormatted={state.totalTimeFormatted}
            />
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            {selectedFile && !isProcessing && !isComplete && !hasError && (
              <button
                onClick={handleStartProcessing}
                className="px-6 py-3 text-white font-medium rounded-xl glow-button"
              >
                Start Processing
              </button>
            )}

            {isComplete && (
              <div className="w-full space-y-4">
                {/* Download buttons */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => downloadCsv('anki')}
                    className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    Download for Anki
                  </button>
                  <button
                    onClick={() => downloadCsv('excel')}
                    className="px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    Download for Excel
                  </button>
                  <button
                    onClick={downloadFlashcards}
                    className="px-5 py-2.5 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-500 transition-colors shadow-lg shadow-purple-500/20"
                  >
                    Download Flashcards PDF
                  </button>
                </div>

                {/* Save to account section */}
                {exportUsage && (
                  <div className="border border-white/10 rounded-xl p-4 bg-slate-900/30">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-white">Save to Account</h4>
                      {exportUsage.canSave && exportUsage.exportLimit !== -1 && (
                        <span className="text-xs text-slate-400">
                          {exportUsage.exportsRemaining} saves remaining
                        </span>
                      )}
                    </div>

                    {exportUsage.canSave ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleSaveExport('csv_anki')}
                          disabled={savingExport === 'csv_anki' || savedExports.includes('csv_anki')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            savedExports.includes('csv_anki')
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/10'
                          } disabled:opacity-50`}
                        >
                          {savingExport === 'csv_anki' ? 'Saving...' : savedExports.includes('csv_anki') ? 'Anki CSV Saved' : 'Save Anki CSV'}
                        </button>
                        <button
                          onClick={() => handleSaveExport('csv_excel')}
                          disabled={savingExport === 'csv_excel' || savedExports.includes('csv_excel')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            savedExports.includes('csv_excel')
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/10'
                          } disabled:opacity-50`}
                        >
                          {savingExport === 'csv_excel' ? 'Saving...' : savedExports.includes('csv_excel') ? 'Excel CSV Saved' : 'Save Excel CSV'}
                        </button>
                        <button
                          onClick={() => handleSaveExport('flashcards_pdf')}
                          disabled={savingExport === 'flashcards_pdf' || savedExports.includes('flashcards_pdf')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            savedExports.includes('flashcards_pdf')
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/10'
                          } disabled:opacity-50`}
                        >
                          {savingExport === 'flashcards_pdf' ? 'Saving...' : savedExports.includes('flashcards_pdf') ? 'Flashcards Saved' : 'Save Flashcards'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-400">
                          Upgrade to save exports to your account
                        </p>
                        <Link
                          href="/pricing"
                          className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          View Plans
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 ghost-button text-slate-300 font-medium rounded-lg"
                >
                  Process Another File
                </button>
              </div>
            )}

            {hasError && (
              <button
                onClick={handleReset}
                className="px-5 py-2.5 ghost-button text-slate-300 font-medium rounded-lg"
              >
                Try Again
              </button>
            )}
          </div>

          {/* Handwriting Support Banner */}
          <div className="mt-6 p-4 glass-card rounded-xl border border-purple-500/30 bg-purple-500/5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-purple-300">Handwritten Notes Supported</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Snap a photo of your handwritten notes in any language. Our AI-powered OCR reads cursive, print, and mixed handwriting to create flashcards automatically.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Best results: Good lighting, legible writing, clear photos
                </p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="mt-4 p-4 glass-card rounded-xl border border-indigo-500/20">
            <h3 className="text-sm font-medium text-indigo-300">How it works</h3>
            <ul className="mt-3 text-sm text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 mt-0.5">1.</span>
                <span>Select your extraction mode (Language or Textbook)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 mt-0.5">2.</span>
                <span>Upload a PDF, EPUB, image, or photo of handwritten notes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 mt-0.5">3.</span>
                <span>We&apos;ll extract text using advanced OCR that reads 100+ languages including handwriting</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 mt-0.5">4.</span>
                <span>AI analyzes the text to find {extractionMode === 'language' ? 'vocabulary with translations' : 'key concepts and definitions'}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 mt-0.5">5.</span>
                <span>Download as CSV for Anki or as printable flashcards</span>
              </li>
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Tip: Keep this tab open during processing. Large documents may take a few minutes.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
