import type { JSONObject } from '@ai-sdk/provider';

// Source-type shapes mirror the camelCase fields in
// `@ai-sdk/xai`'s `xaiLanguageModelChatOptions.searchParameters.sources`.
// Keep in sync with `packages/xai/src/xai-chat-language-model-options.ts`.
// We deliberately don't import from `@ai-sdk/xai` to avoid a cross-package
// dep; xAI's wire-level field names are public API.
//
// Each source extends `JSONObject` so the result of `xaiSearchParameters()`
// is structurally assignable to `providerOptions.xai.searchParameters`
// (typed as `JSONValue | undefined`).

/**
 * Search a `web` source — the public web.
 */
export interface XaiSearchWebSource extends JSONObject {
  type: 'web';
  /** Two-letter ISO 3166-1 alpha-2 country code (e.g. `'US'`, `'GB'`). */
  country?: string;
  /** Up to 5 domains to exclude from search results. */
  excludedWebsites?: string[];
  /** Up to 5 domains to restrict search results to. */
  allowedWebsites?: string[];
  /** Whether to apply safe-search filtering. */
  safeSearch?: boolean;
}

/**
 * Search an `x` source — posts on X (formerly Twitter).
 */
export interface XaiSearchXSource extends JSONObject {
  type: 'x';
  /** X handles to exclude. */
  excludedXHandles?: string[];
  /** X handles to restrict the search to. */
  includedXHandles?: string[];
  /** Only include posts with at least this many favorites. */
  postFavoriteCount?: number;
  /** Only include posts with at least this many views. */
  postViewCount?: number;
}

/**
 * Search a `news` source.
 */
export interface XaiSearchNewsSource extends JSONObject {
  type: 'news';
  /** Two-letter ISO 3166-1 alpha-2 country code. */
  country?: string;
  /** Up to 5 news domains to exclude. */
  excludedWebsites?: string[];
  /** Whether to apply safe-search filtering. */
  safeSearch?: boolean;
}

/**
 * Search an `rss` source — fetch from a specific RSS feed.
 */
export interface XaiSearchRssSource extends JSONObject {
  type: 'rss';
  /** RSS feed URLs. xAI currently supports a single link. */
  links: string[];
}

export type XaiSearchSource =
  | XaiSearchNewsSource
  | XaiSearchRssSource
  | XaiSearchWebSource
  | XaiSearchXSource;

/**
 * Strict input shape for `xaiSearchParameters()`. No `JSONObject` index
 * signature — keeps typo'd keys as compile errors. Mirrors the field set of
 * `XaiSearchParameters`; `mode` is optional here (the builder defaults it).
 */
export interface XaiSearchParametersConfig {
  /**
   * Search mode preference.
   * - `'on'` (default): always invoke Live Search. Matches xAI's documented
   *   default for `search_parameters.mode`.
   * - `'auto'`: the model decides whether to search.
   * - `'off'`: disable Live Search (equivalent to omitting `searchParameters`).
   */
  mode?: 'auto' | 'off' | 'on';

  /**
   * Maximum number of search results to consider per request (1-50).
   * Primary cost-control knob; defaults to xAI's server-side default
   * (currently 20) when omitted.
   */
  maxSearchResults?: number;

  /** Whether to return citations. Defaults to `true` on xAI's side. */
  returnCitations?: boolean;

  /** Earliest publication date (ISO-8601 `YYYY-MM-DD`). */
  fromDate?: string;

  /** Latest publication date (ISO-8601 `YYYY-MM-DD`). */
  toDate?: string;

  /**
   * Data sources to search. Defaults to `[{ type: 'web' }, { type: 'x' }]`
   * on xAI's side when omitted.
   */
  sources?: XaiSearchSource[];
}

/**
 * Output of `xaiSearchParameters()` — the camelCase object assignable to
 * `providerOptions.xai.searchParameters`. Extends `JSONObject` for that
 * assignment to type-check; otherwise structurally identical to
 * `XaiSearchParametersConfig` except that `mode` is always present.
 */
export interface XaiSearchParameters extends JSONObject {
  mode: 'auto' | 'off' | 'on';
  maxSearchResults?: number;
  returnCitations?: boolean;
  fromDate?: string;
  toDate?: string;
  sources?: XaiSearchSource[];
}

/**
 * Build a typed `searchParameters` object for xAI Grok models, with `mode`
 * defaulted to `'on'` (xAI's documented default for `search_parameters.mode`).
 *
 * This is a config builder, not an AI SDK tool: xAI Live Search is
 * provider-native and dispatched automatically by xAI when relevant. Pass the
 * result through `providerOptions.xai.searchParameters` — the gateway already
 * forwards `providerOptions.xai.*` end-to-end, so no gateway-specific support
 * is required for this to work.
 *
 * Value over inline construction: type-checking the config and the
 * `sources` discriminated union (which `providerOptions` does not type),
 * plus the `'auto'` default.
 *
 * Imported from `@ai-sdk/gateway` directly (not from `gateway.tools.*`,
 * which is reserved for actual AI SDK tools the model can invoke).
 *
 * @example
 * ```ts
 * import { xaiSearchParameters } from '@ai-sdk/gateway';
 * import { generateText } from 'ai';
 *
 * const result = await generateText({
 *   model: 'xai/grok-4-fast-reasoning',
 *   prompt: 'What happened in markets today?',
 *   providerOptions: {
 *     xai: {
 *       searchParameters: xaiSearchParameters({
 *         mode: 'on',
 *         maxSearchResults: 5,
 *         sources: [{ type: 'web', country: 'US' }],
 *       }),
 *     },
 *   },
 * });
 * ```
 *
 * @see https://docs.x.ai/docs/guides/live-search
 */
export function xaiSearchParameters(
  config: XaiSearchParametersConfig = {},
): XaiSearchParameters {
  return { ...config, mode: config.mode ?? 'on' };
}
