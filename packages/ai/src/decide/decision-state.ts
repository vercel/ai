import type {
  Experimental_DecisionModelV4State as DecisionModelV4State,
  JSONObject,
  JSONValue,
} from '@ai-sdk/provider';
import type { FilePart, TextPart } from '@ai-sdk/provider-utils';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';

/** Shared text, JSON data, or ordered multimodal parts for a decision. */
export type DecisionState =
  | string
  | Readonly<JSONObject>
  | readonly DecisionStatePart[];

export type DecisionStatePart =
  | TextPart
  | FilePart
  | { type: 'json'; value: JSONValue };

export async function prepareDecisionState(
  state: DecisionState,
  abortSignal?: AbortSignal,
): Promise<DecisionModelV4State> {
  if (typeof state === 'string') {
    return [{ type: 'text', text: state }];
  }
  if (!Array.isArray(state)) {
    return [{ type: 'json', value: state as Readonly<JSONObject> }];
  }
  const files = state.filter((part): part is FilePart => part.type === 'file');
  if (files.length === 0) return state as DecisionModelV4State;

  const prompt = await convertToLanguageModelPrompt({
    prompt: {
      instructions: undefined,
      messages: [{ role: 'user', content: files }],
    },
    supportedUrls: {},
    download: undefined,
    abortSignal,
  });
  const message = prompt[0];
  if (message.role !== 'user') throw new Error('Expected user message.');
  let fileIndex = 0;
  return state.map(part =>
    part.type === 'file' ? message.content[fileIndex++] : part,
  );
}
