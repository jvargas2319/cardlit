import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function Home() {
  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden">
      {/* Light beams */}
      <div className="beam h-[500px] left-[20%] top-0 opacity-50" />
      <div className="beam h-[400px] left-[50%] top-0 opacity-30" />
      <div className="beam h-[450px] left-[75%] top-0 opacity-40" />

      {/* Header */}
      <header className="relative z-10 py-6 px-4 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Logo size="md" />
          <div className="space-x-4 flex items-center">
            <Link
              href="/login"
              className="text-slate-400 hover:text-white font-medium transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-white font-medium rounded-lg glow-button"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-20">
        <div className="text-center space-y-6">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
            Extract vocabulary from{' '}
            <span className="gradient-text">any book</span>
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Upload a PDF, EPUB, or photo of handwritten notes in any language. Our AI extracts vocabulary and creates flashcards instantly.
          </p>
          <div className="pt-6">
            <Link
              href="/register"
              className="inline-block px-8 py-4 text-white font-medium text-lg rounded-xl glow-button"
            >
              Start Extracting Vocabulary
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-28 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass-card p-6 rounded-xl card-hover">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">PDF & EPUB Support</h3>
            <p className="mt-2 text-slate-400 text-sm leading-relaxed">
              Upload textbooks, novels, or any educational material. We handle both scanned PDFs (with OCR) and EPUBs.
            </p>
          </div>

          <div className="glass-card p-6 rounded-xl card-hover border border-purple-500/20">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Handwritten Notes</h3>
            <p className="mt-2 text-slate-400 text-sm leading-relaxed">
              Snap a photo of your handwritten notes. Works best with clear, legible handwriting in 100+ languages.
            </p>
          </div>

          <div className="glass-card p-6 rounded-xl card-hover">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">AI-Powered Extraction</h3>
            <p className="mt-2 text-slate-400 text-sm leading-relaxed">
              Our AI finds vocabulary words and extracts their definitions directly from the book&apos;s context.
            </p>
          </div>

          <div className="glass-card p-6 rounded-xl card-hover">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Anki-Ready Export</h3>
            <p className="mt-2 text-slate-400 text-sm leading-relaxed">
              Download as CSV for Anki or as printable flashcard PDFs. Save exports to your account.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-28">
          <h3 className="text-2xl font-bold text-white text-center mb-12">How it works</h3>
          <div className="flex flex-col md:flex-row items-center justify-center gap-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/30">1</div>
              <span className="text-slate-300">Upload your book</span>
            </div>
            <svg className="hidden md:block w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/30">2</div>
              <span className="text-slate-300">AI extracts vocabulary</span>
            </div>
            <svg className="hidden md:block w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/30">3</div>
              <span className="text-slate-300">Download CSV for Anki</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-white/5 mt-24">
        <div className="max-w-6xl mx-auto px-4 text-center text-slate-500">
          <p>Cardlit - Extract vocabulary from books for Anki</p>
        </div>
      </footer>
    </div>
  );
}
