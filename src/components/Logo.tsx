import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  linkToHome?: boolean;
}

const sizeConfig = {
  sm: {
    icon: 'w-5 h-5',
    text: 'text-lg',
    gap: 'gap-1.5',
  },
  md: {
    icon: 'w-6 h-6',
    text: 'text-xl',
    gap: 'gap-2',
  },
  lg: {
    icon: 'w-8 h-8',
    text: 'text-2xl',
    gap: 'gap-2.5',
  },
};

export function Logo({ size = 'md', linkToHome = true }: LogoProps) {
  const config = sizeConfig[size];

  const logoContent = (
    <span className={`flex items-center ${config.gap}`}>
      {/* Flashcard stack icon */}
      <span className="relative">
        {/* Back card */}
        <svg
          className={`${config.icon} text-purple-500 absolute -top-0.5 -left-0.5 opacity-60`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <rect x="3" y="4" width="16" height="12" rx="2" />
        </svg>
        {/* Front card with gradient */}
        <svg
          className={`${config.icon} relative`}
          viewBox="0 0 24 24"
          fill="none"
        >
          <defs>
            <linearGradient id="cardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <rect
            x="5"
            y="6"
            width="16"
            height="12"
            rx="2"
            fill="url(#cardGradient)"
          />
          {/* Text lines on card */}
          <line x1="8" y1="10" x2="18" y2="10" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <line x1="8" y1="14" x2="14" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
      </span>
      {/* Text with gradient */}
      <span
        className={`${config.text} font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent`}
      >
        Cardlit
      </span>
    </span>
  );

  if (linkToHome) {
    return (
      <Link href="/" className="hover:opacity-90 transition-opacity">
        {logoContent}
      </Link>
    );
  }

  return logoContent;
}

