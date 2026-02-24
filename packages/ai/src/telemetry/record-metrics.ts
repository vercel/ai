import { Attributes, Counter, Histogram, Meter, UpDownCounter } from '@opentelemetry/api';

/**
 * AI SDK metrics instruments.
 */
export interface AIMetrics {
  /** Counter for total number of requests */
  request_counter: Counter;
  /** Counter for total tokens used (with type attribute for prompt/completion) */
  token_counter: Counter;
  /** Counter for total errors */
  error_counter: Counter;
  /** Counter for tool calls */
  tool_call_counter: Counter;
  /** Histogram for request duration in milliseconds */
  duration_histogram: Histogram;
  /** Histogram for time to first token in milliseconds (streaming only) */
  time_to_first_token_histogram: Histogram;
  /** UpDownCounter for active requests */
  active_requests: UpDownCounter;
}

/**
 * Create AI SDK metrics instruments from a meter.
 *
 * @param meter - OpenTelemetry Meter instance.
 * @returns AIMetrics object containing all metric instruments.
 */
export function createAIMetrics(meter: Meter): AIMetrics {
  return {
    request_counter: meter.createCounter('ai.requests.total', {
      description: 'Total number of AI requests',
      unit: '{request}',
    }),

    token_counter: meter.createCounter('ai.tokens.total', {
      description: 'Total number of tokens used',
      unit: '{token}',
    }),

    error_counter: meter.createCounter('ai.errors.total', {
      description: 'Total number of errors',
      unit: '{error}',
    }),

    tool_call_counter: meter.createCounter('ai.tool_calls.total', {
      description: 'Total number of tool calls',
      unit: '{call}',
    }),

    duration_histogram: meter.createHistogram('ai.request.duration', {
      description: 'Request duration in milliseconds',
      unit: 'ms',
    }),

    time_to_first_token_histogram: meter.createHistogram('ai.time_to_first_token', {
      description: 'Time to first token in milliseconds',
      unit: 'ms',
    }),

    active_requests: meter.createUpDownCounter('ai.requests.active', {
      description: 'Number of currently active requests',
      unit: '{request}',
    }),
  };
}

/**
 * Data for recording request completion metrics.
 */
export interface RequestMetricsData {
  /** Request duration in milliseconds */
  duration_ms: number;
  /** Number of prompt tokens used */
  prompt_tokens: number;
  /** Number of completion tokens used */
  completion_tokens: number;
  /** Whether the request was successful */
  success: boolean;
  /** Finish reason from the model */
  finish_reason?: string;
}

/**
 * Record metrics for a completed request.
 *
 * @param ai_metrics - AIMetrics instance.
 * @param attributes - Common attributes for all metrics.
 * @param data - Request completion data.
 */
export function recordRequestMetrics(
  ai_metrics: AIMetrics,
  attributes: Attributes,
  data: RequestMetricsData,
): void {
  const base_labels: Attributes = {
    ...attributes,
    'ai.request.success': data.success,
  };

  if (data.finish_reason) {
    base_labels['ai.response.finish_reason'] = data.finish_reason;
  }

  // Record request count
  ai_metrics.request_counter.add(1, base_labels);

  // Record duration
  ai_metrics.duration_histogram.record(data.duration_ms, base_labels);

  // Record tokens with type attribute
  if (data.prompt_tokens > 0) {
    ai_metrics.token_counter.add(data.prompt_tokens, {
      ...base_labels,
      'ai.token.type': 'prompt',
    });
  }

  if (data.completion_tokens > 0) {
    ai_metrics.token_counter.add(data.completion_tokens, {
      ...base_labels,
      'ai.token.type': 'completion',
    });
  }

  // Record error if not successful
  if (!data.success) {
    ai_metrics.error_counter.add(1, base_labels);
  }
}

/**
 * Data for recording streaming metrics.
 */
export interface StreamMetricsData extends RequestMetricsData {
  /** Time to first token in milliseconds */
  time_to_first_token_ms?: number;
}

/**
 * Record metrics for a completed streaming request.
 *
 * @param ai_metrics - AIMetrics instance.
 * @param attributes - Common attributes for all metrics.
 * @param data - Stream completion data.
 */
export function recordStreamMetrics(
  ai_metrics: AIMetrics,
  attributes: Attributes,
  data: StreamMetricsData,
): void {
  // Record base request metrics
  recordRequestMetrics(ai_metrics, attributes, data);

  // Record time to first token if available
  if (data.time_to_first_token_ms !== undefined && data.time_to_first_token_ms > 0) {
    ai_metrics.time_to_first_token_histogram.record(data.time_to_first_token_ms, {
      ...attributes,
      'ai.request.success': data.success,
    });
  }
}

/**
 * Record metrics for a tool call.
 *
 * @param ai_metrics - AIMetrics instance.
 * @param attributes - Common attributes for all metrics.
 * @param data - Tool call data.
 */
export function recordToolCallMetrics(
  ai_metrics: AIMetrics,
  attributes: Attributes,
  data: {
    tool_name: string;
    success: boolean;
    duration_ms?: number;
  },
): void {
  const labels: Attributes = {
    ...attributes,
    'ai.tool_call.name': data.tool_name,
    'ai.tool_call.success': data.success,
  };

  ai_metrics.tool_call_counter.add(1, labels);

  if (!data.success) {
    ai_metrics.error_counter.add(1, {
      ...labels,
      'ai.error.type': 'tool_call',
    });
  }
}

/**
 * Helper to increment active requests counter.
 *
 * @param ai_metrics - AIMetrics instance.
 * @param attributes - Common attributes.
 */
export function incrementActiveRequests(
  ai_metrics: AIMetrics,
  attributes: Attributes,
): void {
  ai_metrics.active_requests.add(1, attributes);
}

/**
 * Helper to decrement active requests counter.
 *
 * @param ai_metrics - AIMetrics instance.
 * @param attributes - Common attributes.
 */
export function decrementActiveRequests(
  ai_metrics: AIMetrics,
  attributes: Attributes,
): void {
  ai_metrics.active_requests.add(-1, attributes);
}
