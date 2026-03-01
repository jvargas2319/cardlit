'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

interface SavedExport {
  id: string;
  name: string;
  type: string;
  fileSize: number;
  itemCount: number;
  expiresAt: string | null;
  createdAt: string;
  jobFileName: string;
  extractionMode: string;
}

interface ExportUsage {
  tier: string;
  tierName: string;
  exportsUsed: number;
  exportLimit: number;
  exportsRemaining: number;
  canSave: boolean;
  storageDays: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getExportTypeLabel(type: string): string {
  switch (type) {
    case 'csv_anki':
      return 'Anki CSV';
    case 'csv_excel':
      return 'Excel CSV';
    case 'flashcards_pdf':
      return 'Flashcards PDF';
    default:
      return type;
  }
}

function getExportTypeIcon(type: string): React.ReactNode {
  if (type === 'flashcards_pdf') {
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export default function ExportsPage() {
  const router = useRouter();
  const [exports, setExports] = useState<SavedExport[]>([]);
  const [usage, setUsage] = useState<ExportUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchExports();
  }, []);

  const fetchExports = async () => {
    try {
      const response = await fetch('/api/exports');
      const data = await response.json();
      if (data.success) {
        setExports(data.data.exports);
        setUsage(data.data.usage);
      }
    } catch (error) {
      console.error('Failed to fetch exports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (exportId: string) => {
    window.location.href = `/api/exports/${exportId}`;
  };

  const handleDelete = async (exportId: string) => {
    if (!confirm('Are you sure you want to delete this export?')) {
      return;
    }

    setDeleting(exportId);

    try {
      const response = await fetch(`/api/exports/${exportId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setExports(exports.filter(e => e.id !== exportId));
      }
    } catch (error) {
      console.error('Failed to delete export:', error);
    } finally {
      setDeleting(null);
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
          <Logo size="md" />
          <div className="flex items-center gap-4">
            <Link
              href="/upload"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Upload
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
        {/* Back to Dashboard */}
        <Link
          href="/upload"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>

        {/* Usage Display */}
        {usage && (
          <div className="glass-card rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-300">
                    {usage.exportLimit === -1
                      ? `${usage.exportsUsed} exports saved`
                      : `${usage.exportsUsed} / ${usage.exportLimit} exports used this month`}
                  </span>
                  <span className="text-xs text-slate-500">{usage.tierName} plan</span>
                </div>
                {usage.exportLimit !== -1 && (
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usage.exportsRemaining <= 2 ? 'bg-red-500' :
                        usage.exportsRemaining <= 5 ? 'bg-yellow-500' : 'progress-gradient'
                      }`}
                      style={{ width: `${Math.min((usage.exportsUsed / usage.exportLimit) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {!usage.canSave && usage.tier === 'trial' && (
                <Link
                  href="/pricing"
                  className="ml-4 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                >
                  Upgrade to Save
                </Link>
              )}
            </div>
            {usage.storageDays !== -1 && usage.storageDays > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                Exports are stored for {usage.storageDays} days
              </p>
            )}
          </div>
        )}

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-white">My Saved Exports</h2>
          <Link
            href="/upload"
            className="px-4 py-2 text-sm text-white font-medium rounded-lg glow-button"
          >
            Process New File
          </Link>
        </div>

        {/* Exports List */}
        {loading ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-400">Loading exports...</p>
          </div>
        ) : exports.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <svg
              className="w-12 h-12 text-slate-600 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <h3 className="text-lg font-medium text-white mb-2">No saved exports</h3>
            <p className="text-slate-400 mb-6">
              {usage?.canSave
                ? 'Process a file and save your exports to access them here.'
                : 'Upgrade to a paid plan to save exports to your account.'}
            </p>
            <Link
              href={usage?.canSave ? '/upload' : '/pricing'}
              className="px-6 py-2 text-white font-medium rounded-lg glow-button inline-block"
            >
              {usage?.canSave ? 'Process a File' : 'View Plans'}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {exports.map((exp) => {
              const isExpired = exp.expiresAt && new Date(exp.expiresAt) < new Date();
              const isExpiringSoon = exp.expiresAt && !isExpired &&
                new Date(exp.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

              return (
                <div
                  key={exp.id}
                  className={`glass-card rounded-xl p-4 ${isExpired ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${
                        exp.type === 'flashcards_pdf' ? 'bg-purple-500/20 text-purple-400' :
                        exp.type === 'csv_anki' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-indigo-500/20 text-indigo-400'
                      }`}>
                        {getExportTypeIcon(exp.type)}
                      </div>
                      <div>
                        <h3 className="font-medium text-white">{exp.name}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-400">
                          <span>{getExportTypeLabel(exp.type)}</span>
                          <span className="text-slate-600">•</span>
                          <span>{exp.itemCount} items</span>
                          <span className="text-slate-600">•</span>
                          <span>{formatFileSize(exp.fileSize)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <span>Created {formatDate(exp.createdAt)}</span>
                          {exp.expiresAt && (
                            <>
                              <span className="text-slate-600">•</span>
                              <span className={isExpired ? 'text-red-400' : isExpiringSoon ? 'text-yellow-400' : ''}>
                                {isExpired ? 'Expired' : `Expires ${formatDate(exp.expiresAt)}`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isExpired && (
                        <button
                          onClick={() => handleDownload(exp.id)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Download"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(exp.id)}
                        disabled={deleting === exp.id}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        {deleting === exp.id ? (
                          <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
