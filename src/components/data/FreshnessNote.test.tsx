// The freshness note, and the one thing it must never do: claim freshness it cannot verify.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FreshnessNote } from './FreshnessNote';
import type { StatusDocument } from '@/services/siteData';

const mockStatus = vi.hoisted(() => ({ current: null as unknown, failed: false, loading: false }));

vi.mock('@/services/siteData', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    useSiteStatus: () => ({ status: mockStatus.current, failed: mockStatus.failed, loading: mockStatus.loading }),
  };
});

function statusDoc(over: { boardState?: string; boardAge?: number | null }): StatusDocument {
  return {
    generatedAt: '2026-09-12T18:00:00.000Z',
    board: {
      state: (over.boardState ?? 'current') as never,
      ageHours: over.boardAge ?? 2,
      currentWithinHours: 12,
      publishedAt: '2026-09-12T16:00:00.000Z',
      entryCount: 867,
    },
    market: { state: 'current', ageHours: 10, currentWithinHours: 336, capturedAt: 'x', sourceTimestamp: 'y', quoteCount: 439 },
    overall: 'ok',
  } as StatusDocument;
}

describe('FreshnessNote', () => {
  it('renders NOTHING when there is no status document', () => {
    // An unlabelled board is honest. A board labelled "updated just now" on no evidence is not.
    mockStatus.current = null;
    mockStatus.failed = false;
    const { container } = render(<FreshnessNote dataset="board" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING when the status document could not be read', () => {
    mockStatus.current = statusDoc({});
    mockStatus.failed = true;
    const { container } = render(<FreshnessNote dataset="board" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('states the age when the board is current', () => {
    mockStatus.current = statusDoc({ boardState: 'current', boardAge: 3 });
    mockStatus.failed = false;
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Updated 3h ago')).toBeInTheDocument();
  });

  it('says a stale board is stale, and when it was last updated', () => {
    mockStatus.current = statusDoc({ boardState: 'stale', boardAge: 30 });
    mockStatus.failed = false;
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Board updated yesterday')).toBeInTheDocument();
    expect(screen.getByText(/has not completed recently/)).toBeInTheDocument();
  });

  it('never claims up-to-date when the update time is unknown', () => {
    mockStatus.current = statusDoc({ boardState: 'unknown', boardAge: null });
    mockStatus.failed = false;
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Board update time unknown')).toBeInTheDocument();
    expect(screen.queryByText(/up to date/i)).toBeNull();
  });

  it('leaks no operational field into the DOM', () => {
    mockStatus.current = statusDoc({ boardState: 'expired', boardAge: 24 * 40 });
    mockStatus.failed = false;
    const { container } = render(<FreshnessNote dataset="board" />);
    expect(container.textContent ?? '').not.toMatch(/requiredProviderFailure|partial|heap|runId|checksum|nflverse|sleeper/i);
  });
});
