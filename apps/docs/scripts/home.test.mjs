import assert from 'node:assert/strict';
import test from 'node:test';
import { CORE_EXAMPLES, providersFor, resolveProvider } from '../lib/home/code-examples.ts';
import { FALLBACK_STATS, fetchOssStats } from '../lib/home/oss-stats.ts';

test('switching capabilities and source keeps the selected provider supported', () => {
  assert.equal(resolveProvider('transcription', 'gateway', 'anthropic'), 'openai');
  assert.equal(resolveProvider('speech', 'provider', 'elevenlabs'), 'elevenlabs');
  assert.equal(resolveProvider('speech', 'gateway', 'elevenlabs'), 'openai');
  assert.deepEqual(providersFor('video', 'provider'), ['grok', 'google']);
});

test('examples use current model factories and stream/tool APIs', () => {
  const example = label => CORE_EXAMPLES.find(item => item.label === label);
  assert.match(example('Image Generation').getCode('google', 'custom'), /provider\.imageModel\('my-model'\)/);
  assert.match(example('Speech').getCode('elevenlabs', 'provider'), /elevenlabs\.speech\(/);
  assert.match(example('Speech').getCode('openai', 'gateway'), /const \{ audio \}/);
  assert.match(example('Text Generation').getCode('moonshot', 'provider'), /@ai-sdk\/moonshotai/);
  assert.match(example('Text Generation').getCode('meta', 'provider'), /@ai-sdk\/togetherai/);
  assert.match(example('Tool Calling').getCode('openai', 'gateway'), /inputSchema: z\.object/);
  assert.match(example('Error Handling').getCode('openai', 'gateway'), /process\.stdout\.write\(part\.text\)/);
  assert.match(example('DevTools').getCode('openai', 'gateway'), /model: gateway\(/);
});

test('stats combine npm downloads, GitHub stars, and contributor pagination', async () => {
  const stats = await fetchOssStats(async url => {
    if (url.includes('npmjs')) return Response.json({ downloads: 30_400_000 });
    if (url.includes('contributors')) return new Response('[]', { headers: { link: '<https://api.github.com/repos/vercel/ai/contributors?per_page=1&anon=true&page=728>; rel="last"' } });
    return Response.json({ stargazers_count: 27_200 });
  });
  assert.deepEqual(stats, { downloads: '30.4M', stars: '27.2K', contributors: '728+' });
});

test('stats degrade independently for rate limits, malformed data, and network failures', async () => {
  assert.deepEqual(await fetchOssStats(async () => new Response(null, { status: 429 })), FALLBACK_STATS);
  assert.deepEqual(await fetchOssStats(async () => { throw new Error('offline'); }), FALLBACK_STATS);
  const stats = await fetchOssStats(async url => url.includes('npmjs')
    ? Response.json({ downloads: 12_300_000 })
    : Response.json({ stargazers_count: 'not a number' }));
  assert.deepEqual(stats, { ...FALLBACK_STATS, downloads: '12.3M' });
});
