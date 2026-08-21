import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  lazySchema,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { asGatewayError } from './errors';
import type { GatewayConfig } from './gateway-config';

export interface GatewayModelMetricsOptions {
  /** Filter to a specific model type (e.g. 'language'). */
  type?: string;
  /** Filter to models that have all of these capability tags. */
  tags?: string[];
  /** Only include models with an input price at or below this value (USD per token). */
  maxInputPrice?: number;
  /** Sort order for the returned rows. */
  sort?: 'cost' | 'ttft' | 'tps' | 'reliability';
  /** Maximum number of rows to return (up to 500). */
  limit?: number;
}

export interface GatewayModelMetricMeta {
  /**
   * Where the value comes from: declared by the provider, observed from
   * live gateway traffic, or verified by active probes.
   */
  source: 'declared' | 'observed' | 'verified';
  /** Observation window the value was computed over (e.g. '1h'). */
  window?: string;
  /** ISO 8601 timestamp of when the value was measured. */
  measuredAt?: string;
  /** Number of samples behind the value. */
  sampleSize?: number | null;
  /** Region the value was measured from. */
  region?: string;
}

export interface GatewayModelMetricsRow {
  /** The model id in 'creator/model-slug' format. */
  id: string;
  /** The display name of the model. */
  name: string;
  /**
   * The provider this row was measured for. `null` for catalog-only rows
   * that have no observed metrics.
   */
  provider: string | null;
  /** Model type (e.g. 'language'). */
  type: string | null;
  /** Capability tags of the model (e.g. 'tools', 'reasoning'). */
  tags?: string[];

  /**
   * Declared pricing as decimal strings in USD per token. The `input` and
   * `output` fields are omitted when the model is not token-priced.
   */
  pricing: {
    /** Cost per input token in USD. */
    input?: string;
    /** Cost per output token in USD. */
    output?: string;
    meta: GatewayModelMetricMeta;
  };
  /** Time to first token (TTFT) in milliseconds over the last hour. */
  latency: {
    p50: number;
    p95: number;
    meta: GatewayModelMetricMeta;
  } | null;
  /** Output throughput in tokens per second over the last hour. */
  throughput: {
    p50: number;
    p95: number;
    meta: GatewayModelMetricMeta;
  } | null;
  /** Uptime success percentages (0-100) over trailing windows. */
  uptime: {
    last15m: number | null;
    last1h: number | null;
    last1d: number | null;
    meta: GatewayModelMetricMeta;
  } | null;
}

export interface GatewayModelMetricsResponseMeta {
  /** ISO 8601 timestamp of when the response was generated. */
  generatedAt: string;
  /** Observation windows the metrics were computed over. */
  sourceWindows: {
    latency: string;
    throughput: string;
    uptime: string[];
  };
  /** Human-readable note about where the metric values come from. */
  provenanceNote: string;
}

export interface GatewayModelMetricsResponse {
  object: 'list';
  data: GatewayModelMetricsRow[];
  meta: GatewayModelMetricsResponseMeta;
}

export class GatewayModelMetrics {
  constructor(private readonly config: GatewayConfig) {}

  async getModelMetrics(
    options: GatewayModelMetricsOptions = {},
  ): Promise<GatewayModelMetricsResponse> {
    try {
      const baseUrl = new URL(this.config.baseURL);

      const searchParams = new URLSearchParams();

      if (options.type) {
        searchParams.set('type', options.type);
      }
      if (options.tags) {
        for (const tag of options.tags) {
          searchParams.append('tag', tag);
        }
      }
      if (options.maxInputPrice != null) {
        searchParams.set('max_input_price', String(options.maxInputPrice));
      }
      if (options.sort) {
        searchParams.set('sort', options.sort);
      }
      if (options.limit != null) {
        searchParams.set('limit', String(options.limit));
      }

      const query = searchParams.toString();

      const { value } = await getFromApi({
        url: `${baseUrl.origin}/v1/models/metrics${query ? `?${query}` : ''}`,
        headers: this.config.headers
          ? await resolve(this.config.headers)
          : undefined,
        successfulResponseHandler: createJsonResponseHandler(
          gatewayModelMetricsResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        fetch: this.config.fetch,
      });

      return value;
    } catch (error) {
      throw await asGatewayError(error);
    }
  }
}

const gatewayModelMetricMetaSchema = z
  .object({
    source: z.enum(['declared', 'observed', 'verified']),
    window: z.string().optional(),
    measured_at: z.string().optional(),
    sample_size: z.number().nullable().optional(),
    region: z.string().optional(),
  })
  .transform(({ measured_at, sample_size, ...rest }) => ({
    ...rest,
    ...(measured_at !== undefined ? { measuredAt: measured_at } : {}),
    ...(sample_size !== undefined ? { sampleSize: sample_size } : {}),
  }));

const gatewayModelMetricsResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      object: z.literal('list'),
      data: z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            provider: z.string().nullable(),
            type: z.string().nullable(),
            tags: z.array(z.string()).optional(),
            pricing: z.object({
              input: z.string().optional(),
              output: z.string().optional(),
              meta: gatewayModelMetricMetaSchema,
            }),
            // Metric groups are nullish (not just nullable) for forward
            // compatibility: if the gateway ever omits a group key instead
            // of sending null, older SDK versions keep parsing.
            latency_last_1h: z
              .object({
                p50: z.number(),
                p95: z.number(),
                meta: gatewayModelMetricMetaSchema,
              })
              .nullish(),
            throughput_last_1h: z
              .object({
                p50: z.number(),
                p95: z.number(),
                meta: gatewayModelMetricMetaSchema,
              })
              .nullish(),
            uptime: z
              .object({
                last_15m: z.number().nullable(),
                last_1h: z.number().nullable(),
                last_1d: z.number().nullable(),
                meta: gatewayModelMetricMetaSchema,
              })
              .transform(({ last_15m, last_1h, last_1d, meta }) => ({
                last15m: last_15m,
                last1h: last_1h,
                last1d: last_1d,
                meta,
              }))
              .nullish(),
          })
          .transform(
            ({ latency_last_1h, throughput_last_1h, uptime, ...rest }) => ({
              ...rest,
              latency: latency_last_1h ?? null,
              throughput: throughput_last_1h ?? null,
              uptime: uptime ?? null,
            }),
          ),
      ),
      meta: z
        .object({
          generated_at: z.string(),
          source_windows: z.object({
            latency: z.string(),
            throughput: z.string(),
            uptime: z.array(z.string()),
          }),
          provenance_note: z.string(),
        })
        .transform(({ generated_at, source_windows, provenance_note }) => ({
          generatedAt: generated_at,
          sourceWindows: source_windows,
          provenanceNote: provenance_note,
        })),
    }),
  ),
);
