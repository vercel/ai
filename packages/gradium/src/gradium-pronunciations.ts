import { combineHeaders } from '@ai-sdk/provider-utils';
import { cleanHeaders, type GradiumConfig } from './gradium-config';
import { gradiumFailedResponseHandler } from './gradium-error';

export interface GradiumPronunciationRule {
  original: string;
  rewrite: string;
  case_sensitive?: boolean;
}

export interface GradiumPronunciationDictionary {
  uid: string;
  org_uid: string;
  name: string;
  description?: string | null;
  language: string;
  rules: GradiumPronunciationRule[];
  created_at: string;
}

export interface GradiumPronunciationListResponse {
  dictionaries: GradiumPronunciationDictionary[];
  total: number;
}

export interface GradiumPronunciationListOptions {
  limit?: number;
  offset?: number;
  language?: string;
}

export interface GradiumPronunciationCreateOptions {
  name: string;
  language: string;
  description?: string;
  rules?: GradiumPronunciationRule[];
}

export interface GradiumPronunciationUpdateOptions {
  name?: string | null;
  description?: string | null;
  language?: string | null;
  rules?: GradiumPronunciationRule[] | null;
}

/** Surface presented as `gradium.pronunciations` on the provider object. */
export interface GradiumPronunciationsAPI {
  list(
    options?: GradiumPronunciationListOptions,
  ): Promise<GradiumPronunciationListResponse>;
  get(uid: string): Promise<GradiumPronunciationDictionary>;
  create(
    options: GradiumPronunciationCreateOptions,
  ): Promise<GradiumPronunciationDictionary>;
  update(
    uid: string,
    options: GradiumPronunciationUpdateOptions,
  ): Promise<GradiumPronunciationDictionary>;
  delete(uid: string): Promise<void>;
}

async function ensureOk(response: Response, url: string): Promise<void> {
  if (response.ok) return;
  const errorResult = await gradiumFailedResponseHandler({
    response,
    url,
    requestBodyValues: undefined,
  });
  throw errorResult.value;
}

export function createGradiumPronunciationsAPI(
  config: GradiumConfig,
): GradiumPronunciationsAPI {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const baseHeaders = () => config.headers();
  const jsonHeaders = () =>
    cleanHeaders(
      combineHeaders(baseHeaders(), { 'content-type': 'application/json' }),
    );

  return {
    async list({ limit, offset, language } = {}) {
      const url = new URL(
        config.url({ path: '/pronunciations/', modelId: '' }),
      );
      if (limit != null) url.searchParams.set('limit', String(limit));
      if (offset != null) url.searchParams.set('offset', String(offset));
      if (language) url.searchParams.set('language', language);
      const res = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: baseHeaders(),
      });
      await ensureOk(res, url.toString());
      return (await res.json()) as GradiumPronunciationListResponse;
    },

    async get(uid: string) {
      const url = config.url({
        path: `/pronunciations/${encodeURIComponent(uid)}`,
        modelId: '',
      });
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: baseHeaders(),
      });
      await ensureOk(res, url);
      return (await res.json()) as GradiumPronunciationDictionary;
    },

    async create(options: GradiumPronunciationCreateOptions) {
      const url = config.url({ path: '/pronunciations/', modelId: '' });
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(options),
      });
      await ensureOk(res, url);
      return (await res.json()) as GradiumPronunciationDictionary;
    },

    async update(uid: string, options: GradiumPronunciationUpdateOptions) {
      const url = config.url({
        path: `/pronunciations/${encodeURIComponent(uid)}`,
        modelId: '',
      });
      const res = await fetchImpl(url, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(options),
      });
      await ensureOk(res, url);
      return (await res.json()) as GradiumPronunciationDictionary;
    },

    async delete(uid: string) {
      const url = config.url({
        path: `/pronunciations/${encodeURIComponent(uid)}`,
        modelId: '',
      });
      const res = await fetchImpl(url, {
        method: 'DELETE',
        headers: baseHeaders(),
      });
      await ensureOk(res, url);
    },
  };
}

export interface GradiumCreditsSummary {
  remaining_credits: number;
  allocated_credits: number;
  billing_period: string;
  next_rollover_date?: string | null;
  plan_name?: string;
}

export interface GradiumCreditsAPI {
  /** Get the authenticated user's current billing-period credit balance. */
  get(): Promise<GradiumCreditsSummary>;
}

export function createGradiumCreditsAPI(
  config: GradiumConfig,
): GradiumCreditsAPI {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const baseHeaders = () => config.headers();

  return {
    async get(): Promise<GradiumCreditsSummary> {
      const url = config.url({ path: '/usages/credits', modelId: '' });
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: baseHeaders(),
      });
      await ensureOk(res, url);
      return (await res.json()) as GradiumCreditsSummary;
    },
  };
}
