import type { Currency } from '@abcp/shared-types';

import { STORAGE_KEYS } from './constants';

/**
 * Live exchange-rate engine.
 *
 * Source: exchangerate-api.com's free, no-key, CORS-enabled endpoint
 * (`open.er-api.com`) — genuine interbank/market mid-rates, refreshed by the
 * provider roughly once every 24h (the standard cadence for free FX feeds;
 * true tick-by-tick market data requires a paid trading feed). We poll it on
 * an interval from the browser so the app always has the latest rate the
 * provider has published, and cache the last good reading in localStorage so
 * the app still has real (if slightly stale) numbers after a refresh or a
 * temporary network drop — never silently wrong, always labelled with age.
 */

const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
const FX_FETCH_TIMEOUT_MS = 8_000;
export const FX_ATTRIBUTION_URL = 'https://www.exchangerate-api.com';

/** Base currency of `rates` is always USD (rates[X] = how many X per 1 USD). */
export interface FxRates {
  base: 'USD';
  rates: Record<Currency, number>;
  /** ISO timestamp of the rate reading itself (provider's "last updated"), not of our fetch. */
  asOf: string;
  /** When this client last successfully fetched — used for the "checked N min ago" line. */
  fetchedAt: string;
  source: 'live' | 'cache' | 'fallback';
}

/**
 * Static safety net used only if the live endpoint has never once succeeded
 * (first load, offline, endpoint down) — approximate, clearly labelled
 * `source: 'fallback'` wherever it's shown so it's never mistaken for a live quote.
 */
const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1,
  THB: 33,
  LAK: 21600,
};

function readCache(): FxRates | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.fxRates);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FxRates;
    if (!parsed?.rates?.USD || !parsed.rates.THB || !parsed.rates.LAK) return null;
    return { ...parsed, source: 'cache' };
  } catch {
    return null;
  }
}

function writeCache(rates: FxRates): void {
  try {
    localStorage.setItem(STORAGE_KEYS.fxRates, JSON.stringify(rates));
  } catch {
    // localStorage unavailable (private mode, quota) — live rates still work for this session
  }
}

interface RawFxResponse {
  result: string;
  time_last_update_utc: string;
  rates: Record<string, number>;
}

/** Fetches live USD-base rates for every currency the app cares about. Throws on any failure. */
async function fetchLiveRates(): Promise<FxRates> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FX_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FX_ENDPOINT, { signal: controller.signal });
    if (!res.ok) throw new Error(`fx-http-${res.status}`);
    const data = (await res.json()) as RawFxResponse;
    if (data.result !== 'success') throw new Error('fx-provider-error');
    const { LAK, THB } = data.rates;
    if (typeof LAK !== 'number' || typeof THB !== 'number') throw new Error('fx-missing-currency');
    return {
      base: 'USD',
      rates: { USD: 1, THB, LAK },
      asOf: new Date(data.time_last_update_utc).toISOString(),
      fetchedAt: new Date().toISOString(),
      source: 'live',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Live rates with graceful fallthrough: live → last-known-good cache → static fallback. */
export async function getFxRates(): Promise<FxRates> {
  try {
    const live = await fetchLiveRates();
    writeCache(live);
    return live;
  } catch {
    return (
      readCache() ?? {
        base: 'USD',
        rates: FALLBACK_RATES,
        asOf: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        source: 'fallback',
      }
    );
  }
}

/** Converts an amount between any two of the app's currencies via the USD cross-rate. */
export function convertAmount(amount: number, from: Currency, to: Currency, rates: FxRates): number {
  if (from === to) return amount;
  const usd = amount / rates.rates[from];
  return usd * rates.rates[to];
}

/** Currency symbol glyphs, shared by the Topbar ticker and the Settings rate panel. */
export const CCY_GLYPH: Record<Currency, string> = { USD: '$', LAK: '₭', THB: '฿' };

/** `1 USD = 21,600 LAK`-style cross-rate line, tabular-friendly. */
export function formatCrossRate(from: Currency, to: Currency, rates: FxRates): string {
  const value = convertAmount(1, from, to, rates);
  const digits = to === 'LAK' ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
