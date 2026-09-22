// The freshness note, and the one thing it must never do: claim freshness it cannot verify.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FreshnessNote } from './FreshnessNote';
import type { StatusDocument } from '@/services/siteData';

const mockStatus = vi.hoisted(() => ({ current: null as unknown, failed: false, loading: false }));
const mockPublication = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/services/siteData', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    useSiteStatus: () => ({ status: mockStatus.current, failed: mockStatus.failed, loading: mockStatus.loading }),
  };
});

vi.mock('@/services/publication', () => ({
  usePublishedMarket: () => ({ market: mockPublication.current, status: mockPublication.current ? 'success' : 'loading' }),
}));

const NOW = '2026-09-12T18:00:00.000Z';

function statusDoc(over: { boardState?: string; boardAge?: number | null }): StatusDocument {
  const publishedAt = over.boardAge === null
    ? null
    : new Date(Date.parse(NOW) - (over.boardAge ?? 2) * 3_600_000).toISOString();
  return {
    generatedAt: NOW,
    board: {
      state: (over.boardState ?? 'current') as never,
      ageHours: over.boardAge ?? 2,
      currentWithinHours: 12,
      publishedAt,
      entryCount: 867,
      checksum: 'board-abc',
      publicationId: 'pub-1',
      lastAttempt: null,
    },
    market: {
      state: 'current', ageHours: 10, currentWithinHours: 336, capturedAt: 'x',
      sourceTimestamp: 'y', quoteCount: 439, historyAppended: false, lastAttempt: null,
    },
    overall: 'ok',
  } as StatusDocument;
}

function setStatus(over: { boardState?: string; boardAge?: number | null } = {}) {
  const status = statusDoc(over);
  mockStatus.current = status;
  mockPublication.current = status.board.publishedAt === null ? {
    publicationId: 'pub-1', boardChecksum: 'board-abc', publishedAt: 'not-a-date',
  } : {
    publicationId: 'pub-1', boardChecksum: 'board-abc', publishedAt: status.board.publishedAt,
  };
  return status;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  mockStatus.failed = false;
  mockPublication.current = null;
});

afterEach(() => vi.useRealTimers());

describe('FreshnessNote', () => {
  it('renders nothing when no board publication is loaded', () => {
    mockStatus.current = null;
    mockStatus.failed = false;
    const { container } = render(<FreshnessNote dataset="board" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('still ages the loaded board when the status document could not be read', () => {
    setStatus({});
    mockStatus.failed = true;
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Updated 2h ago')).toBeInTheDocument();
  });

  it('states the age when the board is current', () => {
    setStatus({ boardState: 'current', boardAge: 3 });
    mockStatus.failed = false;
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Updated 3h ago')).toBeInTheDocument();
  });

  it('ages while mounted instead of freezing the exported age and state', () => {
    setStatus({ boardState: 'current', boardAge: 2 });
    mockStatus.failed = false;
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Updated 2h ago')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(11 * 3_600_000));
    expect(screen.getByText('Board updated 13h ago')).toBeInTheDocument();
  });

  it('updates immediately when a suspended tab becomes visible and cleans up its clock', () => {
    const clear = vi.spyOn(window, 'clearTimeout');
    const remove = vi.spyOn(document, 'removeEventListener');
    setStatus({ boardAge: 2 });
    const { unmount } = render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Updated 2h ago')).toBeInTheDocument();

    vi.setSystemTime(new Date(Date.parse(NOW) + 11 * 3_600_000));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByText('Board updated 13h ago')).toBeInTheDocument();

    unmount();
    expect(clear).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    clear.mockRestore();
    remove.mockRestore();
  });

  it('shows a matching newer failed attempt beside the unchanged last-good board age', () => {
    const status = setStatus({ boardAge: 30 });
    status.board.lastAttempt = { attemptedAt: new Date(Date.parse(NOW) - 3_600_000).toISOString(), outcome: 'failure' };
    const { rerender } = render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Board updated yesterday')).toBeInTheDocument();
    expect(screen.getByText(/latest refresh failed; this is the last published board/i)).toBeInTheDocument();
    status.board.lastAttempt = { attemptedAt: NOW, outcome: 'success' };
    rerender(<FreshnessNote dataset="board" />);
    expect(screen.queryByText(/latest refresh failed/i)).toBeNull();
  });

  it('does not apply unmatched or older failure evidence to the displayed board', () => {
    const status = setStatus({ boardAge: 2 });
    status.board.checksum = 'different-board';
    status.board.lastAttempt = { attemptedAt: new Date(Date.parse(NOW) - 3_600_000).toISOString(), outcome: 'failure' };
    const { rerender } = render(<FreshnessNote dataset="board" />);
    expect(screen.queryByText(/latest refresh failed/i)).toBeNull();

    status.board.checksum = 'board-abc';
    status.board.lastAttempt = { attemptedAt: new Date(Date.parse(NOW) - 4 * 3_600_000).toISOString(), outcome: 'failure' };
    rerender(<FreshnessNote dataset="board" />);
    expect(screen.queryByText(/latest refresh failed/i)).toBeNull();
  });

  it('does not present a future-dated failure attempt as observed', () => {
    const status = setStatus({ boardAge: 2 });
    status.board.lastAttempt = {
      attemptedAt: new Date(Date.parse(NOW) + 3_600_000).toISOString(), outcome: 'failure',
    };
    render(<FreshnessNote dataset="board" />);
    expect(screen.queryByText(/latest refresh failed/i)).toBeNull();
  });

  it('does not label a future publication timestamp as fresh', () => {
    setStatus({ boardAge: 2 });
    mockPublication.current = {
      publicationId: 'pub-1', boardChecksum: 'board-abc',
      publishedAt: new Date(Date.parse(NOW) + 3_600_000).toISOString(),
    };
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Board update time unknown')).toBeInTheDocument();
    expect(screen.queryByText(/up to date|updated less/i)).toBeNull();
  });

  it('says a stale board is stale, and when it was last updated', () => {
    setStatus({ boardState: 'stale', boardAge: 30 });
    mockStatus.failed = false;
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Board updated yesterday')).toBeInTheDocument();
    expect(screen.getByText(/has not completed recently/)).toBeInTheDocument();
  });

  it('never claims up-to-date when the update time is unknown', () => {
    setStatus({ boardState: 'unknown', boardAge: null });
    mockStatus.failed = false;
    render(<FreshnessNote dataset="board" />);
    expect(screen.getByText('Board update time unknown')).toBeInTheDocument();
    expect(screen.queryByText(/up to date/i)).toBeNull();
  });

  it('leaks no operational field into the DOM', () => {
    setStatus({ boardState: 'expired', boardAge: 24 * 40 });
    mockStatus.failed = false;
    const { container } = render(<FreshnessNote dataset="board" />);
    expect(container.textContent ?? '').not.toMatch(/requiredProviderFailure|partial|heap|runId|checksum|nflverse|sleeper/i);
  });
});
