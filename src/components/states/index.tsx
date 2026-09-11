import { ButtonLink, Button } from '@/components/ui/Button';
import { ActivityIcon } from '@/components/ui/icons';
import { cn } from '@/lib/ui';

// Teaching empty state: names the action and offers a one-tap example.
export function EmptyState({
  title,
  body,
  ctaLabel,
  ctaTo,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaTo?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-border-default bg-surface px-6 py-14 text-center">
      <span
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-border-default bg-surface-subtle text-text-muted"
        aria-hidden
      >
        <ActivityIcon size={19} />
      </span>
      <h3 className="mb-2 text-base font-semibold text-text-primary">{title}</h3>
      <p className="mb-5 max-w-md text-sm leading-relaxed text-text-muted">{body}</p>
      {ctaLabel && ctaTo && (
        <ButtonLink to={ctaTo} variant="primary">
          {ctaLabel}
        </ButtonLink>
      )}
    </div>
  );
}

// Per-shape loading skeleton.
export function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-card bg-elevated', className)} aria-hidden />;
}

export function ErrorState({
  message,
  detail,
  onRetry,
  retryLabel = 'Retry',
}: {
  message: string;
  /** Optional second line: what the reader can do, or what is known. Never internal detail. */
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    // A failed load is reported, not alarmed: the panel stays on the product's own
    // surface and lets one small status dot and the words carry the message.
    <div
      role="alert"
      className="flex flex-col items-center rounded-card border border-border-default bg-surface px-6 py-12 text-center"
    >
      <span className="mb-4 h-2 w-2 rounded-full bg-negative" aria-hidden />
      <p className="text-sm font-medium text-text-primary">{message}</p>
      {detail && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-text-muted">{detail}</p>}
      {onRetry && (
        <Button onClick={onRetry} className="mt-5">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
