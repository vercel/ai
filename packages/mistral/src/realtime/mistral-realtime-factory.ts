import {
  InvalidArgumentError,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import {
  createJsonResponseHandler,
  deleteFromApi,
  lazySchema,
  postJsonToApi,
  zodSchema,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { MistralChatModelId } from '../mistral-chat-language-model-options';
import { mistralFailedResponseHandler } from '../mistral-error';
import { MistralRealtimeModel } from './mistral-realtime-model';
import { buildMistralRealtimeSessionConfig } from './mistral-realtime-model-options';

/** Credentials for one browser voice conversation. */
export type MistralRealtimeSession = {
  id: string;
  participantToken: string;
  serverUrl: string;
};

export interface MistralRealtimeFactory {
  (modelId: MistralChatModelId): MistralRealtimeModel;

  /** Server-only: create a voice session using the Mistral API key. */
  createSession(options: {
    model: MistralChatModelId;
    sessionConfig?: RealtimeModelV4SessionConfig;
    abortSignal?: AbortSignal;
  }): Promise<MistralRealtimeSession>;

  /** Server-only: release a voice session after the browser disconnects. */
  closeSession(options: {
    sessionId: string;
    abortSignal?: AbortSignal;
  }): Promise<void>;
}

export function createMistralRealtimeFactory(config: {
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}): MistralRealtimeFactory {
  return Object.assign(
    (modelId: MistralChatModelId) => new MistralRealtimeModel(modelId),
    {
      async createSession({
        model,
        sessionConfig = {},
        abortSignal,
      }: Parameters<MistralRealtimeFactory['createSession']>[0]) {
        if (model.trim().length === 0) {
          throw new InvalidArgumentError({
            argument: 'model',
            message: 'Mistral voice sessions require a model ID.',
          });
        }
        const body = await buildMistralRealtimeSessionConfig(sessionConfig, {
          modelId: model,
        });
        const { value } = await postJsonToApi({
          url: `${config.baseURL}/audio/sessions`,
          headers: config.headers(),
          body,
          failedResponseHandler: mistralFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(sessionSchema),
          abortSignal,
          fetch: config.fetch,
        });
        return {
          id: value.id,
          participantToken: value.participant_token,
          serverUrl: value.server_url,
        };
      },

      async closeSession({
        sessionId,
        abortSignal,
      }: Parameters<MistralRealtimeFactory['closeSession']>[0]) {
        if (
          sessionId.trim().length === 0 ||
          sessionId === '.' ||
          sessionId === '..'
        ) {
          throw new InvalidArgumentError({
            argument: 'sessionId',
            message: 'Mistral voice sessions require a valid session ID.',
          });
        }
        await deleteFromApi({
          url: `${config.baseURL}/audio/sessions/${encodeURIComponent(sessionId)}`,
          headers: config.headers(),
          failedResponseHandler: mistralFailedResponseHandler,
          successfulResponseHandler: async ({ response }) => {
            await response.body?.cancel();
            return { value: undefined };
          },
          abortSignal,
          fetch: config.fetch,
        });
      },
    },
  );
}

const sessionSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string().min(1),
      participant_token: z.string().min(1),
      server_url: z.string().min(1),
    }),
  ),
);
