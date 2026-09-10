import { build } from 'esbuild';
import { writeFileSync, statSync } from 'fs';
import { join } from 'path';

// Stage 2 adds the realtime WebSocket runtime; named probes guard tree shaking.
const LIMIT = 504 * 1024;

interface BundleResult {
  size: number;
  path: string;
  condition: string;
  limit: number;
}

async function bundleForNode(
  entry?: 'generateText' | 'tool',
): Promise<BundleResult> {
  const label = entry == null ? 'node' : `node-${entry}`;
  const outfile = join(process.cwd(), 'dist-bundle-check', `${label}.js`);
  const metafile = join(
    process.cwd(),
    'dist-bundle-check',
    `${label}-meta.json`,
  );

  const result = await build({
    ...(entry == null
      ? { entryPoints: [join(process.cwd(), 'src', 'index.ts')] }
      : {
          stdin: {
            contents: `export { ${entry} } from './src/index';`,
            resolveDir: process.cwd(),
            loader: 'ts' as const,
          },
        }),
    bundle: true,
    platform: 'node',
    target: 'es2020',
    format: 'esm',
    outfile,
    metafile: true,
    minify: true,
    treeShaking: true,
    external: ['arktype', 'effect', '@valibot/to-json-schema'],
  });
  writeFileSync(metafile, JSON.stringify(result.metafile, null, 2));

  const size = statSync(outfile).size;
  return {
    size,
    path: outfile,
    condition: label,
    limit:
      entry === 'tool'
        ? 8 * 1024
        : entry === 'generateText'
          ? 275 * 1024
          : LIMIT,
  };
}

async function bundleForBrowser(
  entry?: 'generateText' | 'tool',
): Promise<BundleResult> {
  const label = entry == null ? 'browser' : `browser-${entry}`;
  const outfile = join(process.cwd(), 'dist-bundle-check', `${label}.js`);
  const metafile = join(
    process.cwd(),
    'dist-bundle-check',
    `${label}-meta.json`,
  );

  const result = await build({
    ...(entry == null
      ? { entryPoints: [join(process.cwd(), 'src', 'index.ts')] }
      : {
          stdin: {
            contents: `export { ${entry} } from './src/index';`,
            resolveDir: process.cwd(),
            loader: 'ts' as const,
          },
        }),
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
    outfile,
    metafile: true,
    minify: true,
    treeShaking: true,
    conditions: ['browser'],
    external: ['arktype', 'effect', '@valibot/to-json-schema'],
  });
  writeFileSync(metafile, JSON.stringify(result.metafile, null, 2));

  const size = statSync(outfile).size;
  return {
    size,
    path: outfile,
    condition: label,
    limit:
      entry === 'tool'
        ? 8 * 1024
        : entry === 'generateText'
          ? 275 * 1024
          : LIMIT,
  };
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function checkSize(result: BundleResult, limit: number): boolean {
  const passed = result.size <= limit;
  const status = passed ? '✅' : '❌';
  const percentage = ((result.size / limit) * 100).toFixed(1);

  console.log(
    `${status} ${result.condition.padEnd(10)} ${formatSize(result.size).padEnd(12)} (${percentage}% of ${formatSize(limit)} limit)`,
  );

  return passed;
}

async function main() {
  console.log('📦 Checking bundle sizes...\n');

  try {
    const results = await Promise.all([
      bundleForNode(),
      bundleForBrowser(),
      bundleForNode('generateText'),
      bundleForBrowser('generateText'),
      bundleForNode('tool'),
      bundleForBrowser('tool'),
    ]);

    console.log('Bundle sizes:');
    const checks = results.map(result => checkSize(result, result.limit));

    console.log('\n---');

    console.log('📦 Bundle size check complete.');
    console.log(
      'Upload dist-bundle-check/*.json files to https://esbuild.github.io/analyze/ for detailed analysis.',
    );

    console.log('\n---');

    if (checks.every(Boolean)) {
      console.log('✅ All bundle size checks passed!');
      process.exit(0);
    } else {
      console.log('❌ Bundle size check failed!');
      console.log('\nTo fix this, either:');
      console.log('1. Reduce the bundle size by optimizing code');
      console.log(
        '2. Update the limit in packages/ai/scripts/check-bundle-size.ts',
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during bundle size check:', error);
    process.exit(1);
  }
}

main();
