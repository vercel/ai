import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const siteUrlSource = stripTypeScriptTypes(
  await readFile(new URL('../lib/geistdocs/site-url.ts', import.meta.url), 'utf8'),
);
const robotsSource = stripTypeScriptTypes(
  await readFile(new URL('../app/robots.ts', import.meta.url), 'utf8'),
);
const moduleUrl = source =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let moduleId = 0;

async function robotsWithEnv(overrides = {}) {
  const env = {
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'ai-sdk-docs.vercel.sh',
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'ai-sdk.dev',
    ...overrides,
  };
  const previous = Object.fromEntries(
    Object.keys(env).map(key => [key, process.env[key]]),
  );
  const applyEnv = values => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  applyEnv(env);
  try {
    // Re-evaluate both modules because the canonical URL is resolved at import.
    const siteUrlModule = moduleUrl(`${siteUrlSource}\n// ${moduleId++}`);
    const { default: robots } = await import(
      moduleUrl(robotsSource.replace('@/lib/geistdocs/site-url', siteUrlModule))
    );
    return robots();
  } finally {
    applyEnv(previous);
  }
}

const indexable = {
  rules: { userAgent: '*', allow: '/' },
  sitemap: 'https://ai-sdk.dev/sitemap.xml',
};
const blocked = { rules: { userAgent: '*', disallow: '/' } };

test('production allows indexing before the canonical domain is transferred', async () => {
  assert.deepEqual(await robotsWithEnv(), indexable);
});

test('production allows indexing after the canonical domain is transferred', async () => {
  assert.deepEqual(
    await robotsWithEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'ai-sdk.dev' }),
    indexable,
  );
});

test('the canonical URL can include its HTTPS scheme', async () => {
  assert.deepEqual(
    await robotsWithEnv({
      NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'https://ai-sdk.dev',
    }),
    indexable,
  );
});

test('non-production environments remain blocked with the production canonical URL', async () => {
  for (const VERCEL_ENV of ['preview', 'development', undefined]) {
    assert.deepEqual(await robotsWithEnv({ VERCEL_ENV }), blocked);
  }
});

test('production remains blocked without the expected canonical origin', async () => {
  for (const canonicalUrl of [
    undefined,
    'not a valid URL',
    'ai-sdk-docs.vercel.sh',
    'http://ai-sdk.dev',
  ]) {
    assert.deepEqual(
      await robotsWithEnv({
        VERCEL_PROJECT_PRODUCTION_URL: 'ai-sdk.dev',
        NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: canonicalUrl,
      }),
      blocked,
    );
  }
});
