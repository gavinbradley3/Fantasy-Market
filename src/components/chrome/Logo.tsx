import { useId } from 'react';
import { cn } from '@/lib/ui';

/**
 * The PlayerTicker mark: two angled rails whose negative space forms a football.
 * Geometry is taken verbatim from the brand kit's logo-symbol.svg. The gradient id
 * is per-instance so several marks can share a page without colliding.
 */
export function LogoSymbol({ size = 28, className }: { size?: number; className?: string }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="24" y1="18" x2="104" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7B61FF" />
          <stop offset="1" stopColor="#3882F6" />
        </linearGradient>
      </defs>
      <path d="M26 30L57 48L43 65L20 51L26 30Z" fill={`url(#${gradientId})`} />
      <path d="M102 98L71 80L85 63L108 77L102 98Z" fill={`url(#${gradientId})`} />
      <path
        d="M56 48C65 42 76 44 84 51C92 58 94 67 89 75C84 83 73 86 63 81C53 76 47 67 49 59C50 55 52 51 56 48Z"
        fill="#0B0F14"
      />
      <path d="M62 56L76 70" stroke="#F2F4F7" strokeWidth={3} strokeLinecap="round" />
      {size >= 40 && (
        <path
          d="M64 61L68 57M68 65L72 61M72 69L76 65"
          stroke="#F2F4F7"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * Full horizontal lockup. The wordmark is live text rather than outlines so it
 * stays crisp, selectable and readable by assistive technology.
 */
export function Logo({
  size = 28,
  descriptor = false,
  className,
}: {
  size?: number;
  descriptor?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoSymbol size={size} />
      <span className="flex flex-col justify-center leading-none">
        <span
          className="font-ui font-bold tracking-[-0.02em] text-text-primary"
          style={{ fontSize: size * 0.64 }}
        >
          Player<span className="text-brand-blue">Ticker</span>
        </span>
        {descriptor && (
          <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            Fantasy Football Market
          </span>
        )}
      </span>
    </span>
  );
}
