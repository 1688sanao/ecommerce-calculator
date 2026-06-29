export const EXCHANGE_RATE_CACHE_KEY = "ecommerce-calculator:exchange-rates";
export const EXCHANGE_RATE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export interface ExchangeRateData {
  cnyToJpy: number;
  usdToJpy: number;
  updatedAtUtc?: string;
}

export interface ExchangeRateCacheEntry extends ExchangeRateData {
  fetchedAt: number;
}

export type ExchangeRateLoadStatus =
  | "loading"
  | "cache"
  | "api"
  | "stale-cache"
  | "failed";

export interface ExchangeRateLoadResult {
  rates: ExchangeRateData | null;
  status: ExchangeRateLoadStatus;
  error?: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function formatRateForInput(value: number): string {
  return value.toFixed(2);
}

export function readExchangeRateCache(): ExchangeRateCacheEntry | null {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(EXCHANGE_RATE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ExchangeRateCacheEntry;
    if (
      typeof parsed.cnyToJpy !== "number" ||
      typeof parsed.usdToJpy !== "number" ||
      typeof parsed.fetchedAt !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeExchangeRateCache(data: ExchangeRateData): void {
  if (!isBrowser()) return;

  const entry: ExchangeRateCacheEntry = {
    ...data,
    fetchedAt: Date.now(),
  };

  localStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify(entry));
}

export function isExchangeRateCacheFresh(
  fetchedAt: number,
  now = Date.now()
): boolean {
  return now - fetchedAt < EXCHANGE_RATE_CACHE_TTL_MS;
}

async function fetchExchangeRatesFromApi(): Promise<ExchangeRateData> {
  const response = await fetch("/api/exchange-rates");

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "汇率接口请求失败");
  }

  return (await response.json()) as ExchangeRateData;
}

export async function loadExchangeRates(): Promise<ExchangeRateLoadResult> {
  const cached = readExchangeRateCache();

  if (cached && isExchangeRateCacheFresh(cached.fetchedAt)) {
    return {
      rates: {
        cnyToJpy: cached.cnyToJpy,
        usdToJpy: cached.usdToJpy,
        updatedAtUtc: cached.updatedAtUtc,
      },
      status: "cache",
    };
  }

  try {
    const rates = await fetchExchangeRatesFromApi();
    writeExchangeRateCache(rates);

    return {
      rates,
      status: "api",
    };
  } catch (error) {
    if (cached) {
      return {
        rates: {
          cnyToJpy: cached.cnyToJpy,
          usdToJpy: cached.usdToJpy,
          updatedAtUtc: cached.updatedAtUtc,
        },
        status: "stale-cache",
        error: error instanceof Error ? error.message : "汇率获取失败",
      };
    }

    return {
      rates: null,
      status: "failed",
      error: error instanceof Error ? error.message : "汇率获取失败",
    };
  }
}
