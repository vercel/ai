import {
  experimental_getVideoStatus,
  experimental_startVideo,
  type GetVideoStatusResult,
  type StartVideoResult,
} from 'ai';
import { createWebhook, getStepMetadata } from 'workflow';

type StartVideoOptions = Parameters<typeof experimental_startVideo>[0];
type GetVideoStatusOptions = Parameters<typeof experimental_getVideoStatus>[1];

/**
 * Options for durable video generation in a workflow.
 */
export type WorkflowGenerateVideoOptions = Omit<
  StartVideoOptions,
  'abortSignal' | 'webhookUrl'
>;

/**
 * A completed video generation result containing provider video data.
 * Hosted videos remain URLs and are not downloaded automatically.
 */
export type WorkflowGenerateVideoResult = Extract<
  GetVideoStatusResult,
  { status: 'completed' }
>;

async function startVideoStep(
  options: StartVideoOptions,
): Promise<StartVideoResult> {
  'use step';

  const hasIdempotencyKey = Object.keys(options.headers ?? {}).some(
    key => key.toLowerCase() === 'idempotency-key',
  );

  return experimental_startVideo({
    ...options,
    headers: {
      ...options.headers,
      ...(hasIdempotencyKey
        ? {}
        : {
            'idempotency-key': `aisdk_workflow_video_${getStepMetadata().stepId}`,
          }),
    },
  });
}

startVideoStep.maxRetries = 0;

async function getVideoStatusStep(
  model: StartVideoOptions['model'],
  options: GetVideoStatusOptions,
): Promise<GetVideoStatusResult> {
  'use step';

  return experimental_getVideoStatus(model, options);
}

getVideoStatusStep.maxRetries = 0;

/**
 * Generates a video durably inside a workflow using a provider webhook.
 *
 * The workflow suspends without consuming compute until the provider calls the
 * generated webhook URL. The returned video data is not downloaded, allowing
 * the workflow to decide how to handle provider-hosted URLs.
 */
export async function experimental_generateVideo(
  options: WorkflowGenerateVideoOptions,
): Promise<WorkflowGenerateVideoResult> {
  if (
    typeof options.model !== 'string' &&
    (options.model.specificationVersion !== 'v4' ||
      options.model.handleWebhookOption == null)
  ) {
    throw new Error(
      'Workflow video generation requires a model with native webhook support.',
    );
  }

  let operation: StartVideoResult['operation'];
  let startWarnings: StartVideoResult['warnings'];

  {
    using webhook = createWebhook();

    const startResult = await startVideoStep({
      ...options,
      webhookUrl: webhook.url,
    });

    operation = startResult.operation;
    startWarnings = startResult.warnings;
    await webhook;
  }

  const statusResult = await getVideoStatusStep(options.model, {
    operation,
    headers: options.headers,
    maxRetries: options.maxRetries,
  });

  if (statusResult.status === 'error') {
    throw new Error(statusResult.error);
  }

  if (statusResult.status !== 'completed') {
    throw new Error(
      'Video generation did not complete after webhook notification.',
    );
  }

  return {
    ...statusResult,
    warnings: [...startWarnings, ...statusResult.warnings],
  };
}
