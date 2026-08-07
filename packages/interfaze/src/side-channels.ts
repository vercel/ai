export const INTERFAZE_BASE_URL = 'https://api.interfaze.ai/v1';
export const INTERFAZE_MODEL = 'interfaze-beta';

const TAG_RE = (tag: string) =>
  new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');

/**
 * Pull `<think>`/`<precontext>` blocks out of a complete (non-streamed)
 * string; returns the remaining visible text plus any extracted reasoning /
 * precontext. Interfaze's non-streaming responses already separate these
 * into top-level `reasoning`/`precontext` fields, so this is a defensive
 * no-op in the common case — it only does work if tags leak into `content`.
 */
export function stripSideChannels(content: string): {
  text: string;
  reasoning?: string;
  precontext?: unknown[];
} {
  let text = content;

  const thinks: string[] = [];
  text = text.replace(TAG_RE('think'), (_m, inner: string) => {
    thinks.push(inner.trim());
    return '';
  });

  const pre: unknown[] = [];
  text = text.replace(TAG_RE('precontext'), (_m, inner: string) => {
    try {
      const parsed = JSON.parse(inner.trim());
      if (Array.isArray(parsed)) {
        pre.push(...parsed);
      } else {
        pre.push(parsed);
      }
    } catch {
      // ignore malformed block
    }
    return '';
  });

  const out: { text: string; reasoning?: string; precontext?: unknown[] } = {
    text: text.trim(),
  };
  if (thinks.length > 0) {
    out.reasoning = thinks.join('\n');
  }
  if (pre.length > 0) {
    out.precontext = pre;
  }
  return out;
}

/** Interfaze returns `json_object` content wrapped in a ```json fence; unwrap it. */
export function stripJsonFence(content: string): string {
  const t = content.trim();
  if (!t.startsWith('```')) {
    return content;
  }
  return t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

const SIDE_OPEN = ['<think>', '<precontext>'] as const;
const SIDE_CLOSE: Record<string, string> = {
  '<think>': '</think>',
  '<precontext>': '</precontext>',
};

function suffixPrefixLen(s: string, tag: string): number {
  for (let k = Math.min(s.length, tag.length - 1); k > 0; k--) {
    if (s.slice(s.length - k) === tag.slice(0, k)) {
      return k;
    }
  }
  return 0;
}

/**
 * Strips inline `<think>`/`<precontext>` blocks from streamed content, chunk
 * by chunk, holding back any text that might be the start of a tag until
 * enough of the stream has arrived to decide.
 */
export class SideChannelFilter {
  #buf = '';
  #close: string | undefined;

  feed(text: string): string {
    this.#buf += text;
    const out: string[] = [];
    while (this.#buf) {
      if (this.#close === undefined) {
        const lt = this.#buf.indexOf('<');
        if (lt === -1) {
          out.push(this.#buf);
          this.#buf = '';
          break;
        }
        if (lt > 0) {
          out.push(this.#buf.slice(0, lt));
          this.#buf = this.#buf.slice(lt);
        }
        const opened = SIDE_OPEN.find(t => this.#buf.startsWith(t));
        if (opened) {
          this.#close = SIDE_CLOSE[opened];
          this.#buf = this.#buf.slice(opened.length);
          continue;
        }
        if (SIDE_OPEN.some(t => t.startsWith(this.#buf))) {
          break;
        }
        out.push('<');
        this.#buf = this.#buf.slice(1);
      } else {
        const close = this.#close;
        const end = this.#buf.indexOf(close);
        if (end === -1) {
          const keep = suffixPrefixLen(this.#buf, close);
          this.#buf = keep ? this.#buf.slice(this.#buf.length - keep) : '';
          break;
        }
        this.#buf = this.#buf.slice(end + close.length);
        this.#close = undefined;
      }
    }
    return out.join('');
  }

  flush(): string {
    if (this.#close !== undefined) {
      this.#buf = '';
      return '';
    }
    const rest = this.#buf;
    this.#buf = '';
    return rest;
  }
}
