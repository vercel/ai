import type {
  Experimental_DecisionModelV4State as DecisionModelV4State,
  JSONObject,
  JSONValue,
} from '@ai-sdk/provider';
import {
  DownloadError,
  type FilePart,
  type TextPart,
} from '@ai-sdk/provider-utils';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import type { DownloadFunction } from '../util/download/download-function';

/** Shared text, JSON data, or ordered multimodal parts for a decision. */
export type DecisionState =
  | string
  | Readonly<JSONObject>
  | readonly DecisionStatePart[];

export type DecisionStatePart =
  | TextPart
  | FilePart
  | { type: 'json'; value: JSONValue };

function isDecisionStateParts(
  state: DecisionState,
): state is readonly DecisionStatePart[] {
  return Array.isArray(state);
}

export async function prepareDecisionState({
  state,
  abortSignal,
  download,
}: {
  state: DecisionState;
  abortSignal?: AbortSignal;
  download?: DownloadFunction;
}): Promise<DecisionModelV4State> {
  if (typeof state === 'string') {
    return [{ type: 'text', text: state }];
  }
  if (!isDecisionStateParts(state)) {
    return [{ type: 'json', value: state }];
  }
  if (
    state.every(
      (part): part is Exclude<DecisionStatePart, FilePart> =>
        part.type !== 'file',
    )
  ) {
    return state;
  }
  const files = state.filter((part): part is FilePart => part.type === 'file');

  const prompt = await convertToLanguageModelPrompt({
    prompt: {
      instructions: undefined,
      messages: [{ role: 'user', content: files }],
    },
    supportedUrls: {},
    // Do not silently fetch URL state through the runtime's global fetch.
    // URL/literal-IP validation alone cannot protect against private DNS answers.
    download:
      download ??
      (async requests => {
        if (requests.length > 0) {
          throw new DownloadError({
            url: requests[0].url.toString(),
            message:
              'URL file state requires experimental_download. For untrusted URLs, use createDownload({ fetch }) with a transport that validates DNS at connection time.',
          });
        }
        return [];
      }),
    abortSignal,
  });
  const message = prompt[0];
  if (message.role !== 'user') throw new Error('Expected user message.');
  let fileIndex = 0;
  return state.map(part =>
    part.type === 'file' ? message.content[fileIndex++] : part,
  );
}
