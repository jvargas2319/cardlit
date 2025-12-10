import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Light beams */}
      <div className="beam h-[400px] left-[30%] top-0 opacity-40" />
      <div className="beam h-[350px] left-[60%] top-0 opacity-30" />

      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="glass-card rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <Link href="/" className="inline-block mb-6">
              <span className="text-xl font-bold text-white">Vocab Extractor</span>
            </Link>
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-400">
              Sign in to continue extracting vocabulary
            </p>
          </div>

          <AuthForm mode="login" />

          <p className="text-center text-sm text-slate-400 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
