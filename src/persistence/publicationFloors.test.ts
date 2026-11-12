import { describe, expect, it } from 'vitest';
import { checkPublicationFloors, PRODUCTION_PUBLICATION_FLOORS } from './publicationFloors';

const many = (position: string, valued: number, unvalued = 0) => [
  ...Array.from({ length: valued }, () => ({ position, valued: true })),
  ...Array.from({ length: unvalued }, () => ({ position, valued: false })),
];

/** The shape of the September production board: QB 81/81, RB 149/159, WR 223/240, TE 125/137. */
const SEPTEMBER = [...many('QB', 81), ...many('RB', 149, 10), ...many('WR', 223, 17), ...many('TE', 125, 12)];

describe('publication floors', () => {
  it('pass the real September board', () => {
    expect(checkPublicationFloors(SEPTEMBER, PRODUCTION_PUBLICATION_FLOORS).ok).toBe(true);
  });

  it('refuse a board with an entire position unvalued, and name it', () => {
    // The shape of the back-dated run in the audit: every QB rejected, every other position fine.
    const board = [...many('QB', 0, 112), ...many('RB', 228, 11), ...many('WR', 333, 18), ...many('TE', 171, 10)];
    const report = checkPublicationFloors(board, PRODUCTION_PUBLICATION_FLOORS);
    expect(report.ok).toBe(false);
    expect(report.violations.map((v) => v.position)).toEqual(['QB']);
    expect(report.violations[0].reason).toBe('QB: 0 valued, below the floor of 24');
  });

  it('refuse a position that is missing entirely', () => {
    const board = SEPTEMBER.filter((e) => e.position !== 'TE');
    const report = checkPublicationFloors(board, PRODUCTION_PUBLICATION_FLOORS);
    expect(report.violations.map((v) => v.position)).toEqual(['TE']);
  });

  it('refuse a position whose valued share collapsed even if the count is high', () => {
    const board = [...many('QB', 81), ...many('RB', 149, 10), ...many('WR', 100, 200), ...many('TE', 125, 12)];
    const report = checkPublicationFloors(board, PRODUCTION_PUBLICATION_FLOORS);
    expect(report.ok).toBe(false);
    expect(report.violations[0].reason).toMatch(/^WR: 100 of 300 valued \(33\.3%\), below the floor of 60%$/);
  });
});
