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

function isDecisionStateParts(
  state: DecisionState,
): state is readonly DecisionStatePart[] {
  return Array.isArray(state);
}

export async function prepareDecisionState(
  state: DecisionState,
  abortSignal?: AbortSignal,
): Promise<DecisionModelV4State> {
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
