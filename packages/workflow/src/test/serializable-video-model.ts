import type { Experimental_VideoModelV4 } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { resumeWebhook } from 'workflow/api';

class SerializableVideoModel implements Experimental_VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'workflow-test';
  readonly modelId = 'workflow-test-video';
  readonly maxVideosPerCall = 1;

  static [WORKFLOW_SERIALIZE]() {
    return {};
  }

  static [WORKFLOW_DESERIALIZE]() {
    return new SerializableVideoModel();
  }

  async handleWebhookOption({
    webhook,
  }: Parameters<
    NonNullable<Experimental_VideoModelV4['handleWebhookOption']>
  >[0]) {
    const result = await webhook();
    return { webhookUrl: result.url, received: result.received };
  }

  async doStart(
    options: Parameters<NonNullable<Experimental_VideoModelV4['doStart']>>[0],
  ) {
    if (options.webhookUrl == null) {
      throw new Error('Expected a webhook URL.');
    }

    const webhookUrl = new URL(options.webhookUrl);
    const token = webhookUrl.pathname.split('/').at(-1);
    if (token == null || token.length === 0) {
      throw new Error('Expected a webhook token.');
    }

    const response = await resumeWebhook(
      token,
      new Request(options.webhookUrl, { method: 'POST' }),
    );
    if (!response.ok) {
      throw new Error(
        `Webhook delivery failed with status ${response.status}.`,
      );
    }

    return {
      operation: { id: 'operation-1' },
      warnings: [{ type: 'other' as const, message: 'start warning' }],
      response: {
        timestamp: new Date(0),
        modelId: this.modelId,
        headers: {},
      },
    };
  }

  async doStatus() {
    return {
      status: 'completed' as const,
      videos: [
        {
          type: 'url' as const,
          url: 'https://example.com/video.mp4',
          mediaType: 'video/mp4',
        },
      ],
      warnings: [],
      response: {
        timestamp: new Date(0),
        modelId: this.modelId,
        headers: {},
      },
    };
  }
}

export function createSerializableVideoModel(): Experimental_VideoModelV4 {
  return new SerializableVideoModel();
}
