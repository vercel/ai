import { cacheLife } from 'next/cache';
import { fetchOssStats } from '@/lib/home/oss-stats';
import styles from './home.module.css';

export async function OssStatsSection() {
  'use cache';
  cacheLife('hours');
  const stats = await fetchOssStats();
  return (
    <dl aria-label="AI SDK community" className={styles.stats}>
      {[
        [stats.downloads, 'Weekly downloads'],
        [stats.stars, 'GitHub stars'],
        [stats.contributors, 'Contributors'],
        ['100+', 'Models supported'],
      ].map(([count, label]) => (
        <div className={`${styles.cell} flex flex-col`} key={label}>
          <dt className="order-2 mt-2 font-mono text-sm text-gray-900">
            {label}
          </dt>
          <dd className="text-heading-32">{count}</dd>
        </div>
      ))}
    </dl>
  );
}
