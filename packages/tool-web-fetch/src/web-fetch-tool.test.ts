import { generateText, InvalidArgumentError, isStepCount } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { createWebFetchTool } from './web-fetch-tool';

type WebFetchTool = ReturnType<typeof createWebFetchTool>;

type WebFetchOutput = Exclude<
  Awaited<ReturnType<WebFetchTool['execute']>>,
  AsyncIterable<unknown>
>;

const executionOptions = { toolCallId: 'test-call', messages: [], context: {} };

function createFetch(
  handler: (url: string, init: RequestInit | undefined) => Response,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(input.toString(), init),
  );
}

function html(body: string, head = '<title>Test Page | Example</title>') {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

const articleHtml = html(`
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <main>
    <article>
      <h1>Test Page</h1>
      <p>The quick brown fox jumps over the lazy dog. This paragraph contains
      enough words to be recognized as the main content of the page by the
      content extractor, which removes navigation and footer elements.</p>
      <p>Read the <a href="/docs/guide">guide</a> for more details about the
      fox, the dog, and their long-standing rivalry in the meadow.</p>
    </article>
  </main>
  <footer>Copyright Example Inc.</footer>
`);

function execute(
  webFetch: WebFetchTool,
  input: { url: string; offset?: number },
  options: Partial<Parameters<WebFetchTool['execute']>[1]> = {},
): Promise<WebFetchOutput> {
  return webFetch.execute(input, {
    ...executionOptions,
    ...options,
  }) as Promise<WebFetchOutput>;
}

async function toModelOutput(webFetch: WebFetchTool, output: WebFetchOutput) {
  return webFetch.toModelOutput!({
    toolCallId: 'test-call',
    input: { url: 'https://example.com' },
    output: output as never,
  });
}

// Minimal single-page PDF containing the text "Hello PDF".
const minimalPdf = (() => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 41 >>\nstream\nBT /F1 12 Tf 20 100 Td (Hello PDF) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Title (Test PDF) >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
})();

describe('createWebFetchTool', () => {
  describe('options', () => {
    it('rejects combining allowed and blocked domains', () => {
      expect(() =>
        createWebFetchTool({
          allowedDomains: ['example.com'],
          blockedDomains: ['example.org'],
        }),
      ).toThrow(InvalidArgumentError);
    });

    it.each([
      'https://example.com',
      'example.com/path',
      '*.example.com',
      'example.com:8080',
      '',
    ])('rejects invalid domain %j', domain => {
      expect(() => createWebFetchTool({ allowedDomains: [domain] })).toThrow(
        InvalidArgumentError,
      );
    });

    it.each([
      { maxLength: 0 },
      { maxLength: 1.5 },
      { maxBytes: -1 },
      { timeout: 0 },
      { timeout: 2_147_483_648 },
      { pdf: 'image' as 'file' },
    ])('rejects invalid option %j', options => {
      expect(() => createWebFetchTool(options)).toThrow(InvalidArgumentError);
    });

    it('describes the configured behavior', () => {
      const webFetch = createWebFetchTool({
        allowedDomains: ['Example.COM'],
        maxLength: 1000,
        pdf: 'file',
        requireUrlInContext: true,
      });

      expect(webFetch.description).toContain(
        'Only these domains and their subdomains can be fetched: example.com.',
      );
      expect(webFetch.description).toContain('PDFs are returned as files');
      expect(webFetch.description).toContain(
        'Only URLs that appear in the conversation can be fetched.',
      );
    });
  });

  describe('fetching', () => {
    it('converts HTML to markdown with the main content', async () => {
      const fetch = createFetch(
        () =>
          new Response(articleHtml, {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      const output = await execute(webFetch, {
        url: 'https://example.com/blog/post#section',
      });

      expect(output).toMatchObject({
        type: 'document',
        url: 'https://example.com/blog/post#section',
        finalUrl: 'https://example.com/blog/post',
        contentType: 'text/html',
        title: 'Test Page',
        offset: 0,
      });
      expect(output.type === 'document' && output.content).toContain(
        'The quick brown fox',
      );
      // Relative links are resolved against the page URL.
      expect(output.type === 'document' && output.content).toContain(
        '[guide](https://example.com/docs/guide)',
      );
      expect(output.type === 'document' && output.content).not.toContain(
        'Copyright',
      );
    });

    it('sends GET requests preferring markdown with an identifying user agent', async () => {
      const fetch = createFetch(
        () =>
          new Response('# Hello', {
            headers: { 'content-type': 'text/markdown' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      const output = await execute(webFetch, { url: 'https://example.com/' });

      expect(output).toMatchObject({
        type: 'document',
        contentType: 'text/markdown',
        content: '# Hello',
      });
      const headers = new Headers(fetch.mock.calls[0][1]?.headers);
      expect(headers.get('accept')).toMatch(/^text\/markdown, /);
      expect(headers.get('user-agent')).toContain('ai-sdk/tool-web-fetch/');
      expect(fetch.mock.calls[0][1]?.method).toBeUndefined();
    });

    it('uses a custom user agent', async () => {
      const fetch = createFetch(() => new Response('ok'));
      const webFetch = createWebFetchTool({ fetch, userAgent: 'my-agent/1.0' });

      await execute(webFetch, { url: 'https://example.com/' });

      expect(
        new Headers(fetch.mock.calls[0][1]?.headers).get('user-agent'),
      ).toBe('my-agent/1.0');
    });

    it('passes defuddle options to the content extractor', async () => {
      const fetch = createFetch(
        () =>
          new Response(
            html(`
              <main><p>Main content that is long enough to be selected by the extractor as the primary content of this page.</p></main>
              <aside id="sidebar"><p>Sidebar content that should be selected.</p></aside>
            `),
            { headers: { 'content-type': 'text/html' } },
          ),
      );
      const webFetch = createWebFetchTool({
        fetch,
        defuddleOptions: { contentSelector: '#sidebar' },
      });

      const output = await execute(webFetch, { url: 'https://example.com/' });

      expect(output.type === 'document' && output.content).toBe(
        'Sidebar content that should be selected.',
      );
    });

    it('extracts HTML without an <html> element', async () => {
      const paragraph =
        'The quick brown fox jumps over the lazy dog in the meadow. '.repeat(3);
      const fetch = createFetch(
        () =>
          new Response(
            `<!doctype html><title>No Root</title><h1>Heading</h1><p>${paragraph}</p><p>${paragraph}</p>`,
            { headers: { 'content-type': 'text/html' } },
          ),
      );
      const webFetch = createWebFetchTool({ fetch });

      const output = await execute(webFetch, { url: 'https://example.com/' });

      expect(output).toMatchObject({ type: 'document', title: 'No Root' });
      expect(output.type === 'document' && output.content).toContain(
        'The quick brown fox',
      );
    });

    it('returns empty content for pages that require JavaScript', async () => {
      const fetch = createFetch(
        () =>
          new Response(
            html(
              '<div id="root"></div><script src="/app.js"></script>',
              '<title>My App</title>',
            ),
            { headers: { 'content-type': 'text/html' } },
          ),
      );
      const webFetch = createWebFetchTool({ fetch });

      const output = await execute(webFetch, { url: 'https://example.com/' });

      expect(output).toMatchObject({ type: 'document', content: '' });
      expect(await toModelOutput(webFetch, output)).toMatchObject({
        type: 'text',
        value: expect.stringContaining('may require JavaScript'),
      });
    });

    it('falls back to plain text for deeply nested HTML', async () => {
      const depth = 1000;
      const fetch = createFetch(
        () =>
          new Response(
            html(`${'<div>'.repeat(depth)}Deep text${'</div>'.repeat(depth)}`),
            { headers: { 'content-type': 'text/html' } },
          ),
      );
      const webFetch = createWebFetchTool({ fetch });

      const output = await execute(webFetch, { url: 'https://example.com/' });

      expect(output).toMatchObject({ type: 'document', content: 'Deep text' });
    });

    it('returns text formats as is', async () => {
      const fetch = createFetch(
        () =>
          new Response('{"name":"ai"}', {
            headers: { 'content-type': 'application/json' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/data.json' }),
      ).toMatchObject({
        type: 'document',
        contentType: 'application/json',
        content: '{"name":"ai"}',
      });
    });

    it('decodes the charset from the Content-Type header', async () => {
      const fetch = createFetch(
        () =>
          new Response(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), {
            headers: { 'content-type': 'text/plain; charset=iso-8859-1' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/' }),
      ).toMatchObject({ content: 'café' });
    });

    it('decodes the charset from a meta tag in HTML', async () => {
      const page = html(
        '<main><p>Un café crème, s’il vous plaît. Merci beaucoup pour votre accueil chaleureux.</p></main>',
        '<meta charset="windows-1252"><title>Café</title>',
      );
      const body = Uint8Array.from(page, character =>
        character === '’' ? 0x92 : character.charCodeAt(0),
      );
      const fetch = createFetch(
        () => new Response(body, { headers: { 'content-type': 'text/html' } }),
      );
      const webFetch = createWebFetchTool({ fetch });

      const output = await execute(webFetch, { url: 'https://example.com/' });

      expect(output).toMatchObject({ title: 'Café' });
      expect(output.type === 'document' && output.content).toContain(
        'Un café crème, s’il vous plaît.',
      );
    });

    it('sniffs HTML and PDF when the content type is missing', async () => {
      const fetch = createFetch(url =>
        url.endsWith('.pdf')
          ? new Response(minimalPdf, {
              headers: { 'content-type': 'application/octet-stream' },
            })
          : new Response(new TextEncoder().encode(articleHtml)),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/page' }),
      ).toMatchObject({ type: 'document', contentType: 'text/html' });
      expect(
        await execute(webFetch, { url: 'https://example.com/file.pdf' }),
      ).toMatchObject({ type: 'document', contentType: 'application/pdf' });
    });

    it('rejects unsupported content types', async () => {
      const fetch = createFetch(
        () =>
          new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
            headers: { 'content-type': 'image/png' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/image.png' }),
      ).toMatchObject({
        type: 'error',
        errorCode: 'unsupported_content_type',
      });
    });
  });

  describe('PDF', () => {
    it('converts PDFs to text by default', async () => {
      const fetch = createFetch(
        () =>
          new Response(minimalPdf, {
            headers: { 'content-type': 'application/pdf' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/file.pdf' }),
      ).toMatchObject({
        type: 'document',
        contentType: 'application/pdf',
        title: 'Test PDF',
        content: 'Hello PDF',
      });
    });

    it('returns PDFs as files when configured', async () => {
      const fetch = createFetch(
        () =>
          new Response(minimalPdf, {
            headers: { 'content-type': 'application/pdf' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch, pdf: 'file' });

      const output = await execute(webFetch, {
        url: 'https://example.com/file.pdf',
      });

      expect(output).toMatchObject({
        type: 'file',
        mediaType: 'application/pdf',
        data: Buffer.from(minimalPdf).toString('base64'),
      });
      expect(await toModelOutput(webFetch, output)).toEqual({
        type: 'content',
        value: [
          {
            type: 'text',
            text: 'URL: https://example.com/file.pdf\nContent-Type: application/pdf',
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: {
              type: 'data',
              data: Buffer.from(minimalPdf).toString('base64'),
            },
          },
        ],
      });
    });
  });

  describe('truncation', () => {
    it('truncates long content and continues at an offset from the cache', async () => {
      const content = 'a'.repeat(25);
      const fetch = createFetch(() => new Response(content));
      const webFetch = createWebFetchTool({ fetch, maxLength: 10 });

      const first = await execute(webFetch, { url: 'https://example.com/' });
      expect(first).toMatchObject({
        content: 'a'.repeat(10),
        offset: 0,
        totalLength: 25,
        nextOffset: 10,
      });
      expect(await toModelOutput(webFetch, first)).toMatchObject({
        value: expect.stringContaining(
          'Call the tool again with offset 10 to continue reading.',
        ),
      });

      const last = await execute(webFetch, {
        url: 'https://example.com/',
        offset: 20,
      });
      expect(last).toMatchObject({
        content: 'a'.repeat(5),
        offset: 20,
        totalLength: 25,
      });
      expect(last).not.toHaveProperty('nextOffset');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('refetches at offset 0', async () => {
      const fetch = createFetch(() => new Response('a'.repeat(25)));
      const webFetch = createWebFetchTool({ fetch, maxLength: 10 });

      await execute(webFetch, { url: 'https://example.com/' });
      await execute(webFetch, { url: 'https://example.com/' });

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not split surrogate pairs', async () => {
      const fetch = createFetch(() => new Response('abc😀def'));
      const webFetch = createWebFetchTool({ fetch, maxLength: 4 });

      expect(
        await execute(webFetch, { url: 'https://example.com/' }),
      ).toMatchObject({ content: 'abc', nextOffset: 3 });
    });

    it('returns empty content past the end', async () => {
      const fetch = createFetch(() => new Response('short'));
      const webFetch = createWebFetchTool({ fetch });

      const output = await execute(webFetch, {
        url: 'https://example.com/',
        offset: 100,
      });

      expect(output).toMatchObject({ content: '', totalLength: 5 });
      expect(await toModelOutput(webFetch, output)).toMatchObject({
        value: expect.stringContaining('No content at offset 100'),
      });
    });
  });

  describe('URL validation', () => {
    it.each([
      ['not a url', 'invalid_url'],
      ['file:///etc/passwd', 'invalid_url'],
      [`https://example.com/${'a'.repeat(2048)}`, 'invalid_url'],
      ['https://user:password@example.com/', 'url_not_allowed'],
      ['http://localhost:3000/', 'url_not_allowed'],
      ['http://169.254.169.254/latest/meta-data', 'url_not_allowed'],
      ['http://[::1]/', 'url_not_allowed'],
    ])('rejects %s', async (url, errorCode) => {
      const fetch = createFetch(() => new Response('ok'));
      const webFetch = createWebFetchTool({ fetch });

      expect(await execute(webFetch, { url })).toMatchObject({
        type: 'error',
        url,
        errorCode,
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('allows only configured domains and their subdomains', async () => {
      const fetch = createFetch(() => new Response('ok'));
      const webFetch = createWebFetchTool({
        fetch,
        allowedDomains: ['example.com'],
      });

      for (const url of [
        'https://example.com/',
        'https://docs.example.com/',
        'https://EXAMPLE.com./',
      ]) {
        expect(await execute(webFetch, { url })).toMatchObject({
          type: 'document',
        });
      }

      for (const url of [
        'https://example.org/',
        'https://notexample.com/',
        'https://example.com.evil.org/',
      ]) {
        expect(await execute(webFetch, { url })).toMatchObject({
          type: 'error',
          errorCode: 'url_not_allowed',
        });
      }
    });

    it('blocks configured domains and their subdomains', async () => {
      const fetch = createFetch(() => new Response('ok'));
      const webFetch = createWebFetchTool({
        fetch,
        blockedDomains: ['example.com'],
      });

      for (const url of ['https://www.example.com./', 'https://example.com/']) {
        expect(await execute(webFetch, { url })).toMatchObject({
          type: 'error',
          errorCode: 'url_not_allowed',
        });
      }
      expect(
        await execute(webFetch, { url: 'https://example.org/' }),
      ).toMatchObject({ type: 'document' });
    });

    it('requires the URL to appear in the context when configured', async () => {
      const fetch = createFetch(() => new Response('ok'));
      const webFetch = createWebFetchTool({ fetch, requireUrlInContext: true });

      expect(
        await execute(
          webFetch,
          { url: 'https://example.com/?data=secret' },
          {
            messages: [
              { role: 'user', content: 'Read https://example.com' },
              {
                role: 'assistant',
                content: 'I will fetch https://example.com/?data=secret',
              },
            ],
          },
        ),
      ).toMatchObject({ type: 'error', errorCode: 'url_not_in_context' });

      expect(
        await execute(
          webFetch,
          { url: 'https://example.com/docs' },
          {
            messages: [
              { role: 'system', content: 'Docs: https://example.com/docs' },
              { role: 'user', content: 'Read the docs' },
            ],
          },
        ),
      ).toMatchObject({ type: 'error', errorCode: 'url_not_in_context' });

      expect(
        await execute(
          webFetch,
          { url: 'https://example.com' },
          { messages: [{ role: 'user', content: 'Read https://example.com' }] },
        ),
      ).toMatchObject({ type: 'document' });

      expect(
        await execute(
          webFetch,
          { url: 'https://example.com/linked' },
          {
            messages: [
              { role: 'user', content: 'Search for something' },
              {
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolCallId: 'search',
                    toolName: 'search',
                    output: {
                      type: 'json',
                      value: { results: ['https://example.com/linked'] },
                    },
                  },
                ],
              },
            ],
          },
        ),
      ).toMatchObject({ type: 'document' });
    });
  });

  describe('redirects', () => {
    it('follows redirects and reports the final URL', async () => {
      const fetch = createFetch(url =>
        url === 'https://example.com/old'
          ? new Response(null, { status: 301, headers: { location: '/new' } })
          : new Response('moved content'),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/old' }),
      ).toMatchObject({
        type: 'document',
        url: 'https://example.com/old',
        finalUrl: 'https://example.com/new',
        content: 'moved content',
      });
      expect(fetch.mock.calls[0][1]?.redirect).toBe('manual');
    });

    it('applies the domain filter to redirects', async () => {
      const fetch = createFetch(
        () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://evil.org/' },
          }),
      );
      const webFetch = createWebFetchTool({
        fetch,
        allowedDomains: ['example.com'],
      });

      expect(
        await execute(webFetch, { url: 'https://example.com/' }),
      ).toMatchObject({
        type: 'error',
        errorCode: 'url_not_allowed',
        message: expect.stringContaining('Redirect to https://evil.org/'),
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('blocks redirects to private addresses', async () => {
      const fetch = createFetch(
        () =>
          new Response(null, {
            status: 307,
            headers: { location: 'http://169.254.169.254/' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/' }),
      ).toMatchObject({ type: 'error', errorCode: 'url_not_allowed' });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('limits the number of redirects', async () => {
      let count = 0;
      const fetch = createFetch(
        () =>
          new Response(null, {
            status: 302,
            headers: { location: `/redirect-${++count}` },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/' }),
      ).toMatchObject({ type: 'error', errorCode: 'too_many_redirects' });
    });
  });

  describe('errors', () => {
    it('returns HTTP errors', async () => {
      const fetch = createFetch(
        () => new Response('missing', { status: 404, statusText: 'Not Found' }),
      );
      const webFetch = createWebFetchTool({ fetch });

      const output = await execute(webFetch, { url: 'https://example.com/' });

      expect(output).toEqual({
        type: 'error',
        url: 'https://example.com/',
        errorCode: 'http_error',
        statusCode: 404,
        message:
          'Fetching https://example.com/ failed with HTTP 404 Not Found.',
      });
      expect(await toModelOutput(webFetch, output)).toEqual({
        type: 'error-text',
        value: 'Fetching https://example.com/ failed with HTTP 404 Not Found.',
      });
    });

    it('reports bot protection challenges', async () => {
      const fetch = createFetch(
        () =>
          new Response('challenge', {
            status: 403,
            headers: { 'cf-mitigated': 'challenge' },
          }),
      );
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/' }),
      ).toMatchObject({
        errorCode: 'http_error',
        message: expect.stringContaining('blocked by bot protection'),
      });
    });

    it('returns network errors', async () => {
      const fetch = vi.fn(async () => {
        throw new TypeError('fetch failed');
      });
      const webFetch = createWebFetchTool({ fetch });

      expect(
        await execute(webFetch, { url: 'https://example.com/' }),
      ).toMatchObject({ type: 'error', errorCode: 'network_error' });
    });

    it('limits the response size', async () => {
      const fetch = createFetch(() => new Response('a'.repeat(100)));
      const webFetch = createWebFetchTool({ fetch, maxBytes: 10 });

      expect(
        await execute(webFetch, { url: 'https://example.com/' }),
      ).toMatchObject({ type: 'error', errorCode: 'too_large' });
    });

    it('times out slow requests', async () => {
      const fetch = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            if (init?.signal?.aborted) {
              reject(init.signal.reason);
            }
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal!.reason),
            );
          }),
      );
      const webFetch = createWebFetchTool({ fetch, timeout: 20 });
      const controller = new AbortController();

      expect(
        await execute(
          webFetch,
          { url: 'https://example.com/' },
          { abortSignal: controller.signal },
        ),
      ).toMatchObject({ type: 'error', errorCode: 'timeout' });
      expect(controller.signal.aborted).toBe(false);
    });

    it('propagates caller cancellation', async () => {
      const fetch = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            if (init?.signal?.aborted) {
              reject(init.signal.reason);
            }
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal!.reason),
            );
          }),
      );
      const webFetch = createWebFetchTool({ fetch });
      const controller = new AbortController();

      const result = execute(
        webFetch,
        { url: 'https://example.com/' },
        { abortSignal: controller.signal },
      );
      controller.abort(new Error('Cancelled'));

      await expect(result).rejects.toThrow('Cancelled');
    });
  });

  it('executes as a function tool in the standard AI SDK loop', async () => {
    const fetch = createFetch(
      () =>
        new Response('# Docs\n\nHello.', {
          headers: { 'content-type': 'text/markdown' },
        }),
    );
    const webFetch = createWebFetchTool({ fetch });
    const usage = {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'fetch-docs',
              toolName: 'webFetch',
              input: JSON.stringify({ url: 'https://example.com/docs' }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
          warnings: [],
        },
        {
          content: [{ type: 'text', text: 'The docs say hello.' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        },
      ],
    });

    const result = await generateText({
      model,
      tools: { webFetch },
      prompt: 'Read https://example.com/docs',
      stopWhen: isStepCount(2),
    });

    expect(result.text).toBe('The docs say hello.');
    expect(result.steps[0].toolResults[0].output).toMatchObject({
      type: 'document',
      content: '# Docs\n\nHello.',
    });
    expect(model.doGenerateCalls[0].tools).toEqual([
      expect.objectContaining({ type: 'function', name: 'webFetch' }),
    ]);
    expect(model.doGenerateCalls[1].prompt).toContainEqual({
      role: 'tool',
      content: [
        expect.objectContaining({
          type: 'tool-result',
          toolCallId: 'fetch-docs',
          toolName: 'webFetch',
          output: {
            type: 'text',
            value:
              'URL: https://example.com/docs\nContent-Type: text/markdown\n\n# Docs\n\nHello.',
          },
        }),
      ],
    });
  });
});
