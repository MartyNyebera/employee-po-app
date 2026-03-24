import { useState, useEffect, useRef, useCallback } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export function useCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 30000 // default 30 seconds
) {
  const [data, setData] = useState<T | null>(() => {
    const cached = memoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    return null;
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async (force = false) => {
    const cached = memoryCache.get(key);
    if (
      !force &&
      cached &&
      Date.now() - cached.timestamp < cached.ttl
    ) {
      setData(cached.data);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await fetcherRef.current();
      memoryCache.set(key, {
        data: result,
        timestamp: Date.now(),
        ttl,
      });
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [key, ttl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const invalidate = useCallback(() => {
    memoryCache.delete(key);
    refresh(true);
  }, [key, refresh]);

  return { data, loading, error, refresh, invalidate };
}

export function invalidateCache(key: string) {
  memoryCache.delete(key);
}

export function clearAllCache() {
  memoryCache.clear();
}
