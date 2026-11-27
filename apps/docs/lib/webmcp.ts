type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => Promise<unknown>;
};

export type ModelContext = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => Promise<void>;
  waitForToolsUntil?: (ready: Promise<void>) => void;
};

const docsPath =
  /^\/(?:v[56]\/)?(?:docs|providers|cookbook|resources\/recipes)(?:\/|$)/;

const requireString = (value: unknown, name: string, maxLength: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(
      `${name} must be a nonblank string of at most ${maxLength} characters.`,
    );
  }
  return value.trim();
};

const getDocsUrl = (href: string) => {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || !docsPath.test(url.pathname)) {
    throw new Error('Use a documentation URL on this site.');
  }
  return url;
};

const readMarkdown = async (url: URL, signal: AbortSignal) => {
  const page = new URL(url);
  page.search = '';
  page.hash = '';
  const response = await fetch(page, {
    headers: { Accept: 'text/markdown' },
    redirect: 'error',
    signal,
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('text/markdown')
  ) {
    throw new Error('The page does not provide documentation Markdown.');
  }
  return response.text();
};

export const registerDocsTools = (
  context: ModelContext,
  navigate: (href: string, signal: AbortSignal) => Promise<void>,
) => {
  const lifetime = new AbortController();
  const tools: Tool[] = [
    {
      name: 'search_docs',
      description:
        'Search AI SDK documentation for relevant pages and sections. Use a result URL with navigate_to_page to open it. Defaults to the current documentation version.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 500 },
          version: { type: 'string', enum: ['v5', 'v6', 'v7'] },
        },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ query, version }, { signal }) => {
        const currentVersion =
          window.location.pathname.match(/^\/(v[56])(?:\/|$)/)?.[1] ?? 'v7';
        if (
          version !== undefined &&
          version !== 'v5' &&
          version !== 'v6' &&
          version !== 'v7'
        ) {
          throw new Error('version must be v5, v6, or v7.');
        }
        const params = new URLSearchParams({
          query: requireString(query, 'query', 500),
          locale: 'en',
          tag: version ?? currentVersion,
        });
        const response = await fetch(`/api/search?${params}`, { signal });
        if (!response.ok) throw new Error('Documentation search failed.');
        return response.json();
      },
    },
    {
      name: 'navigate_to_page',
      description:
        'Open an AI SDK documentation page or section in this browser tab. Pass a URL returned by search_docs. Resolves after client-side navigation completes.',
      inputSchema: {
        type: 'object',
        properties: { href: { type: 'string', minLength: 1, maxLength: 2048 } },
        required: ['href'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async ({ href }, { signal }) => {
        const url = getDocsUrl(requireString(href, 'href', 2048));
        // Validate the destination before changing the visible page.
        await readMarkdown(url, signal);
        signal.throwIfAborted();
        await navigate(`${url.pathname}${url.search}${url.hash}`, signal);
        return { url: window.location.href, title: document.title };
      },
    },
    {
      name: 'read_current_page',
      description:
        'Read the current AI SDK documentation page as Markdown, including code blocks and links.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (_input, { signal }) => {
        const url = getDocsUrl(window.location.href);
        const title = document.title;
        const markdown = await readMarkdown(url, signal);
        return { url: url.href, title, markdown };
      },
    },
  ];
  const ready = (async () => {
    for (const tool of tools) {
      lifetime.signal.throwIfAborted();
      await context.registerTool(
        {
          ...tool,
          execute: (input, { signal }) =>
            tool.execute(input, {
              signal: AbortSignal.any([
                signal,
                lifetime.signal,
                AbortSignal.timeout(30_000),
              ]),
            }),
        },
        { signal: lifetime.signal },
      );
    }
  })().catch(error => {
    if (!lifetime.signal.aborted) {
      lifetime.abort();
      console.warn('Docs WebMCP registration failed:', error);
    }
  });
  context.waitForToolsUntil?.(ready);
  return () => lifetime.abort();
};
