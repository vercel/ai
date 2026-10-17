import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1Prompt,
} from '@ai-sdk/harness';

const HARNESS_ID = 'jcode';

export function extractJcodePrompt(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  if (typeof prompt.content === 'string') return prompt.content;

  return prompt.content
    .map(part => {
      if (part.type !== 'text') {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: HARNESS_ID,
          message: `jcode: only text user-message parts are supported in the initial adapter; got '${part.type}'.`,
        });
      }
      return part.text;
    })
    .join('\n\n');
}

export function frameJcodeInstructions(
  instructions: string,
  userText: string,
): string {
  return `<session-instructions>\n${instructions}\n</session-instructions>\n\n<user-message>\n${userText}\n</user-message>`;
}
