import type * as DefuddleModule from 'defuddle/node';
import type * as LinkedomModule from 'linkedom';

/**
 * Defuddle options that only shape content extraction. Options that control
 * the output format, logging, or network access are set by the tool.
 */
export type WebFetchDefuddleOptions = Omit<
  DefuddleModule.DefuddleOptions,
  | 'debug'
  | 'fetch'
  | 'markdown'
  | 'profile'
  | 'separateMarkdown'
  | 'url'
  | 'useAsync'
>;

/**
 * Larger HTML is truncated before conversion. Extraction time and memory grow
 * quickly with document size (a 5 MB page needs >1 GB of memory).
 */
const MAX_HTML_LENGTH = 2_000_000;

/**
 * Extraction cost grows quadratically with nesting depth. Real pages rarely
 * exceed a depth of 100; deeper documents fall back to plain text.
 */
const MAX_DOM_DEPTH = 512;

/**
 * When Turndown throws, defuddle does not rethrow. It returns this message
 * followed by the raw HTML as the content, which is not useful to a model.
 */
const PARTIAL_CONVERSION_PREFIX = 'Partial conversion completed with errors';

type HtmlModules = {
  linkedom: typeof LinkedomModule;
  defuddle: typeof DefuddleModule;
};

let htmlModulesPromise: Promise<HtmlModules> | undefined;

function isNodeRuntime(): boolean {
  const runtimeProcess = globalThis.process as
    | {
        release?: { name?: string };
        title?: string;
        versions?: { bun?: string; deno?: string };
      }
    | undefined;

  return (
    runtimeProcess?.release?.name === 'node' &&
    runtimeProcess.versions?.bun == null &&
    runtimeProcess.versions?.deno == null &&
    runtimeProcess.title !== 'workerd' &&
    (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime == null
  );
}

/**
 * Loads linkedom and defuddle on first use so that they are not evaluated
 * unless the tool converts HTML.
 *
 * Defuddle converts to markdown with Turndown. Bundlers targeting edge
 * runtimes resolve Turndown's browser build, which reads `window.DOMParser`
 * once while the module is evaluated. Edge runtimes have no `window`, so the
 * conversion would fail. A `window` with linkedom's `DOMParser` is therefore
 * exposed while defuddle loads.
 *
 * The fake `window` is removed right after loading because many libraries
 * (e.g. React) treat `typeof window !== 'undefined'` as running in a browser.
 * It is never installed in Node.js, where Turndown does not need it: the
 * import is asynchronous, so concurrent server code could observe it.
 */
function loadHtmlModules(): Promise<HtmlModules> {
  htmlModulesPromise ??= (async () => {
    const linkedom = await import('linkedom');

    const globalObject = globalThis as { window?: unknown };
    const installWindow =
      !isNodeRuntime() && typeof globalObject.window === 'undefined';

    if (installWindow) {
      globalObject.window = { DOMParser: linkedom.DOMParser };
    }

    try {
      const defuddle = await import('defuddle/node');
      return { linkedom, defuddle };
    } finally {
      if (installWindow) {
        delete globalObject.window;
      }
    }
  })();

  return htmlModulesPromise;
}

function getMaxDepth(root: Element): number {
  let maxDepth = 0;
  const stack: Array<[Element, number]> = [[root, 1]];

  while (stack.length > 0) {
    const [element, depth] = stack.pop()!;
    if (depth > maxDepth) {
      maxDepth = depth;
      if (maxDepth > MAX_DOM_DEPTH) {
        return maxDepth;
      }
    }

    for (const child of Array.from(element.children)) {
      stack.push([child, depth + 1]);
    }
  }

  return maxDepth;
}

function getPlainText(document: Document): string {
  for (const element of Array.from(
    document.querySelectorAll('script, style, noscript, template'),
  )) {
    element.remove();
  }

  // Fetched content is untrusted and conversion is synchronous, so these
  // patterns must run in linear time. A pattern like /\s*\n\s*/ backtracks
  // quadratically over long whitespace runs without a newline.
  return (document.body?.textContent ?? document.documentElement.textContent)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n[\n ]*/g, '\n')
    .trim();
}

export async function htmlToMarkdown({
  html,
  url,
  defuddleOptions,
}: {
  html: string;
  url: string;
  defuddleOptions: WebFetchDefuddleOptions | undefined;
}): Promise<{ title: string | undefined; content: string }> {
  const { linkedom, defuddle } = await loadHtmlModules();

  let truncated = false;
  if (html.length > MAX_HTML_LENGTH) {
    html = html.slice(0, MAX_HTML_LENGTH);
    truncated = true;
  }

  // linkedom does not create the implied <html> element like browsers do.
  // Without it, documents with several top-level elements (valid HTML5 pages
  // that omit <html>, or HTML fragments) extract to empty content.
  if (!/<html[\s>]/i.test(html)) {
    html = `<!doctype html><html><body>${html}</body></html>`;
  }

  const { document } = linkedom.parseHTML(html);

  let title: string | undefined;
  let content: string;

  if (getMaxDepth(document.documentElement) > MAX_DOM_DEPTH) {
    title = document.title || undefined;
    content = getPlainText(document);
  } else {
    const result = await defuddle.Defuddle(document, url, {
      ...defuddleOptions,
      markdown: true,
      // Async extractors call third-party APIs and bypass URL validation.
      useAsync: false,
    });

    title = result.title || undefined;
    content = result.content;

    // Markdown conversion failed: fall back to the page text. The document
    // was modified by defuddle, so parse the HTML again.
    if (content.startsWith(PARTIAL_CONVERSION_PREFIX)) {
      content = getPlainText(linkedom.parseHTML(html).document);
    }
  }

  if (truncated) {
    content += `\n\n[The page exceeded ${MAX_HTML_LENGTH} characters of HTML and was truncated before conversion.]`;
  }

  return { title, content: content.trim() };
}
