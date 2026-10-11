import assert from 'node:assert/strict';
import { APICallError, experimental_generateVideo as generateVideo } from 'ai';
import type { Experimental_VideoModelV4 } from '@ai-sdk/provider';

const response = {
  timestamp: new Date(0),
  modelId: 'mock',
  headers: {},
};

function createDeduplicatingModel() {
  const jobs = new Map<
    string,
    { operation: string; requestedVideos: number }
  >();
  const startAttempts = new Map<string, number>();
  const starts: Array<{ key: string; requestedVideos: number }> = [];

  const model: Experimental_VideoModelV4 = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    maxVideosPerCall: 2,
    async doStart(options) {
      const key = Object.entries(options.headers ?? {}).find(
        ([name]) => name.toLowerCase() === 'idempotency-key',
      )?.[1];

      assert.ok(key, 'generateVideo must supply an idempotency key to doStart');
      starts.push({ key, requestedVideos: options.n });

      if (!jobs.has(key)) {
        jobs.set(key, {
          operation: String(jobs.size + 1),
          requestedVideos: options.n,
        });
      }

      const attemptId = `${key}:${options.n}`;
      const attempt = (startAttempts.get(attemptId) ?? 0) + 1;
      startAttempts.set(attemptId, attempt);

      // Simulate a lost first response for each split. A correct
      // implementation must retain that split's key for its retry.
      if (attempt === 1) {
        throw new APICallError({
          message: 'lost start response',
          url: 'https://example.com/video/start',
          requestBodyValues: {},
          statusCode: 500,
          responseHeaders: { 'retry-after-ms': '0' },
        });
      }

      return {
        operation: jobs.get(key)!.operation,
        warnings: [],
        response,
      };
    },
    async doStatus({ operation }) {
      const job = [...jobs.values()].find(
        candidate => candidate.operation === operation,
      );
      assert.ok(job, `unknown operation ${String(operation)}`);

      return {
        status: 'completed',
        videos: Array.from(
          { length: job.requestedVideos },
          (_, videoIndex) => ({
            type: 'binary' as const,
            data: new Uint8Array([Number(job.operation) * 10 + videoIndex + 1]),
            mediaType: 'video/mp4',
          }),
        ),
        warnings: [],
        response,
      };
    },
  };

  return { model, jobs, starts };
}

async function invoke(
  model: Experimental_VideoModelV4,
  headers?: Record<string, string>,
) {
  const result = await generateVideo({
    model,
    prompt: 'test',
    n: 3,
    headers,
    maxRetries: 1,
    poll: { intervalMs: 0 },
  });

  return result.videos.map(video => video.uint8Array[0]);
}

async function main() {
  // Control: n=3 is split into batches of 2 and 1. SDK-minted keys already
  // produce two independent jobs and the requested three videos.
  const control = createDeduplicatingModel();
  const controlVideos = await invoke(control.model);
  assert.equal(control.jobs.size, 2);
  assert.deepEqual(controlVideos, [11, 12, 21]);

  const actual = createDeduplicatingModel();
  let firstVideos: number[];

  try {
    firstVideos = await invoke(actual.model, {
      'Idempotency-Key': 'logical-request-1',
    });
  } catch (error) {
    // The issue explicitly identifies rejecting this combination with an
    // explanatory error as an acceptable fix.
    assert.equal(
      actual.starts.length,
      0,
      'a split request must be rejected before starting provider jobs',
    );
    assert.match(String(error), /idempoten/i);
    assert.match(
      String(error),
      /(split|separate|individual|maxVideosPerCall)/i,
    );
    console.log('generateVideo explicitly rejected the unsafe split request');
    return;
  }

  const jobsAfterFirstCall = actual.jobs.size;
  const secondVideos = await invoke(actual.model, {
    'Idempotency-Key': 'logical-request-1',
  });
  const keysBySplitSize = new Map<number, Set<string>>();

  for (const start of actual.starts) {
    const keys = keysBySplitSize.get(start.requestedVideos) ?? new Set();
    keys.add(start.key);
    keysBySplitSize.set(start.requestedVideos, keys);
  }

  const independentAndRepeatable =
    jobsAfterFirstCall === 2 &&
    actual.jobs.size === 2 &&
    JSON.stringify(firstVideos) === JSON.stringify([11, 12, 21]) &&
    JSON.stringify(secondVideos) === JSON.stringify([11, 12, 21]) &&
    keysBySplitSize.get(2)?.size === 1 &&
    keysBySplitSize.get(1)?.size === 1 &&
    keysBySplitSize.get(2)?.values().next().value !==
      keysBySplitSize.get(1)?.values().next().value;

  console.log({
    control: {
      jobs: control.jobs.size,
      keys: control.starts.map(start => start.key),
      videos: controlVideos,
    },
    actual: {
      jobsAfterFirstCall,
      jobsAfterRepeatedCall: actual.jobs.size,
      starts: actual.starts,
      firstVideos,
      secondVideos,
    },
  });

  if (!independentAndRepeatable) {
    throw new Error(
      'ISSUE_22780_REPRODUCED: split generateVideo reused the caller idempotency key and returned duplicate provider output',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
