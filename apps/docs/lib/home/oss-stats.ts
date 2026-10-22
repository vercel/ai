export const FALLBACK_STATS = {
  downloads: '30M+',
  stars: '27K+',
  contributors: '720+',
};

export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(value);
}

export async function fetchOssStats(fetcher: typeof fetch = fetch) {
  const getCount = async (
    url: string,
    key: 'downloads' | 'stargazers_count',
    fallback: string,
  ) => {
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return fallback;
      const data: unknown = await response.json();
      const count =
        data && typeof data === 'object' && key in data
          ? (data as Record<string, unknown>)[key]
          : undefined;
      return typeof count === 'number' && Number.isFinite(count) && count >= 0
        ? formatCount(count)
        : fallback;
    } catch {
      return fallback;
    }
  };
  const getContributors = async () => {
    try {
      const response = await fetcher(
        'https://api.github.com/repos/vercel/ai/contributors?per_page=1&anon=true',
        { signal: AbortSignal.timeout(3000) },
      );
      if (!response.ok) return FALLBACK_STATS.contributors;
      const last = response.headers
        .get('link')
        ?.match(/[?&]page=(\d+)>;\s*rel="last"/);
      return last
        ? `${formatCount(Number(last[1]))}+`
        : FALLBACK_STATS.contributors;
    } catch {
      return FALLBACK_STATS.contributors;
    }
  };
  const [downloads, stars, contributors] = await Promise.all([
    getCount(
      'https://api.npmjs.org/downloads/point/last-week/ai',
      'downloads',
      FALLBACK_STATS.downloads,
    ),
    getCount(
      'https://api.github.com/repos/vercel/ai',
      'stargazers_count',
      FALLBACK_STATS.stars,
    ),
    getContributors(),
  ]);
  return { downloads, stars, contributors };
}
