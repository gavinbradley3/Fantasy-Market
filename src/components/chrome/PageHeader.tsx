import type { ReactNode } from 'react';
import { cn } from '@/lib/ui';

/**
 * One page-title treatment for the whole product, so every screen opens the same
 * way: title, one line of context, and the actions that belong to this page.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight text-text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Section heading inside a page — one step below PageHeader. */
export function SectionHeader({
  title,
  meta,
  action,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {meta && <span className="text-xs text-text-muted">{meta}</span>}
      </div>
      {action}
    </div>
  );
}
