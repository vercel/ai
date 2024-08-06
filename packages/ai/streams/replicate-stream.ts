import { AIStream, type AIStreamCallbacksAndOptions } from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

// from replicate SDK
interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  version: string;
  input: object;
  output?: any;
  source: 'api' | 'web';
  error?: any;
  logs?: string;
  metrics?: {
    predict_time?: number;
  };
  webhook?: string;
  webhook_events_filter?: ('start' | 'output' | 'logs' | 'completed')[];
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  urls: {
    get: string;
    cancel: string;
    stream?: string;
  };
}

/**
 * Stream predictions from Replicate.
 * Only certain models are supported and you must pass `stream: true` to
 * replicate.predictions.create().
 * @see https://github.com/replicate/replicate-javascript#streaming
 *
 * @example
 * const response = await replicate.predictions.create({
 *  stream: true,
 *  input: {
 *    prompt: messages.join('\n')
 *  },
 *  version: '2c1608e18606fad2812020dc541930f2d0495ce32eee50074220b87300bc16e1'
 * })
 *
 * const stream = await ReplicateStream(response)
 * return new StreamingTextResponse(stream)
 *
 */
export async function ReplicateStream(
  res: Prediction,
  cb?: AIStreamCallbacksAndOptions,
  options?: {
    headers?: Record<string, string>;
  },
): Promise<ReadableStream> {
  const url = res.urls?.stream;

  if (!url) {
    if (res.error) throw new Error(res.error);
    else throw new Error('Missing stream URL in Replicate response');
  }

  const eventStream = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...options?.headers,
    },
  });

  return AIStream(eventStream, undefined, cb).pipeThrough(
    createStreamDataTransformer(),
  );
}
