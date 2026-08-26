import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateRouting } from '@vercel/microfrontends/next/testing';

const configPath = fileURLToPath(
  new URL('../microfrontends.ci.json', import.meta.url),
);

test('routes documentation families to the docs application', () => {
  assert.doesNotThrow(() => {
    validateRouting(configPath, {
      'ai-sdk-playground': ['/', '/playground'],
      'ai-sdk-docs': [
        '/v4',
        '/v4/docs/introduction',
        '/v5/docs/introduction',
        '/v6/docs/introduction',
        '/v7/docs/introduction',
        '/docs/introduction',
        '/cookbook/guides/rag-chatbot',
        '/providers/ai-sdk-providers/openai',
        '/resources',
        '/resources/tools',
        '/api/chat',
        '/api/search',
        '/llms.txt',
        '/llms.mdx',
        '/llms.mdx/docs/introduction',
        '/sitemap.md',
        '/sitemap.xml',
        '/robots.txt',
        '/og/docs',
        '/tools-registry',
        '/showcase',
        '/examples/next',
        '/elements',
        '/model-library',
      ],
    });
  });
});
