import { cacheLife } from 'next/cache';
import { fetchOssStats } from '@/lib/home/oss-stats';

export async function OssStatsSection() {
  'use cache';
  cacheLife('hours');
  const stats = await fetchOssStats();
  return (
    <dl
      aria-label="AI SDK community"
      className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 md:grid-cols-4 md:py-20"
    >
      {[
        [stats.downloads, 'Weekly downloads'],
        [stats.stars, 'GitHub stars'],
        [stats.contributors, 'Contributors'],
        ['100+', 'Models supported'],
      ].map(([count, label]) => (
        <div className="flex flex-col" key={label}>
          <dt className="order-2 mt-2 font-sans text-sm text-gray-900">
            {label}
          </dt>
          <dd className="text-heading-40 lg:text-heading-48">{count}</dd>
        </div>
      ))}
    </dl>
  );
}
