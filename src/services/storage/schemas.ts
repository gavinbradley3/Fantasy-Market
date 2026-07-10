// Runtime schemas for everything that crosses the localStorage boundary.
// Persisted data is USER-CONTROLLED INPUT (devtools, extensions, old builds) —
// it is never cast into application state without validation.

import { z } from 'zod';
import { FORMAT_KEYS } from '@/config/market';
import type { FormatKey } from '@/types/market';

const formatKeySchema = z.custom<FormatKey>(
  (v): v is FormatKey => typeof v === 'string' && (FORMAT_KEYS as string[]).includes(v),
  'unknown format key',
);

export const watchlistItemSchema = z.object({
  playerId: z.string().min(1),
  addedAt: z.string().min(1),
  priceAtAdd: z.number().finite(),
  formatAtAdd: formatKeySchema,
});

export const portfolioHoldingSchema = z.object({
  playerId: z.string().min(1),
  addedAt: z.string().min(1),
  priceAtAdd: z.number().finite(),
});

// v2 envelope: collections are wrapped with an explicit version so future
// schema changes are detected instead of guessed. Items stay `unknown` here —
// they are salvaged per-item so one corrupt entry doesn't nuke the rest.
export const envelopeV2Schema = z.object({
  version: z.number(),
  items: z.array(z.unknown()),
});

// v1 legacy shape: a bare array (no envelope).
export const legacyArraySchema = z.array(z.unknown());

export type WatchlistItemParsed = z.infer<typeof watchlistItemSchema>;
export type PortfolioHoldingParsed = z.infer<typeof portfolioHoldingSchema>;
