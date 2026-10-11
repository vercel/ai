import { createDeepgram } from '@ai-sdk/deepgram';
import assert from 'node:assert/strict';

type RecordedRequest = {
  query: Record<string, string>;
  contentType: string | undefined;
  warnings: unknown[];
};

function contentTypeForEncoding(encoding: string | null) {
  switch (encoding) {
    case 'mulaw':
      return 'audio/mulaw;rate=8000';
    case 'alaw':
      return 'audio/alaw;rate=8000';
    case 'linear16':
      return 'audio/l16;rate=24000';
    default:
      return 'application/octet-stream';
  }
}

async function main() {
  const requests: RecordedRequest[] = [];
  const provider = createDeepgram({
    apiKey: 'synthetic',
    fetch: async input => {
      const url = new URL(String(input));
      const query = Object.fromEntries(url.searchParams);
      const contentType = contentTypeForEncoding(
        url.searchParams.get('encoding'),
      );

      requests.push({ query, contentType, warnings: [] });

      return new Response(new Uint8Array([0, 0]), {
        headers: { 'content-type': contentType },
      });
    },
  });
  const model = provider.speech('aura-2-thalia-en');

  async function generate(
    outputFormat: string,
    deepgram: { container: string; encoding?: string },
  ) {
    const result = await model.doGenerate({
      text: 'Hello',
      outputFormat,
      providerOptions: { deepgram },
    });
    const request = requests.at(-1);
    assert.ok(request, 'Deepgram request was not made');
    request.warnings = result.warnings;
    request.contentType = result.response?.headers?.['content-type'];
    return request;
  }

  // Documented workaround: explicitly repeat the already-selected encoding.
  const explicitEncoding = await generate('mulaw', {
    container: 'none',
    encoding: 'mulaw',
  });
  assert.equal(explicitEncoding.query.encoding, 'mulaw');
  assert.equal(explicitEncoding.query.container, 'none');
  assert.equal(explicitEncoding.contentType, 'audio/mulaw;rate=8000');

  // Control: changing only the container is valid when the resolved codec is
  // already linear16.
  const linear16Control = await generate('linear16', { container: 'none' });
  assert.equal(linear16Control.query.encoding, 'linear16');
  assert.equal(linear16Control.query.container, 'none');
  assert.equal(linear16Control.contentType, 'audio/l16;rate=24000');

  const cases = [
    {
      outputFormat: 'mulaw',
      container: 'none',
      expectedEncoding: 'mulaw',
      expectedContentType: 'audio/mulaw;rate=8000',
    },
    {
      outputFormat: 'alaw',
      container: 'none',
      expectedEncoding: 'alaw',
      expectedContentType: 'audio/alaw;rate=8000',
    },
    {
      outputFormat: 'mulaw',
      container: 'wav',
      expectedEncoding: 'mulaw',
      expectedContentType: 'audio/mulaw;rate=8000',
    },
  ] as const;
  const failures: string[] = [];

  for (const testCase of cases) {
    const observed = await generate(testCase.outputFormat, {
      container: testCase.container,
    });

    if (
      observed.query.encoding !== testCase.expectedEncoding ||
      observed.query.container !== testCase.container ||
      observed.contentType !== testCase.expectedContentType
    ) {
      failures.push(
        `${testCase.outputFormat}/${testCase.container}: ` +
          `encoding=${observed.query.encoding}, ` +
          `container=${observed.query.container}, ` +
          `content-type=${observed.contentType}, ` +
          `warnings=${JSON.stringify(observed.warnings)}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_22969: Deepgram container override changed requested speech codec\n' +
        failures.map(failure => `- ${failure}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22969 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
