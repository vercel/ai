import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1Prompt,
} from '@ai-sdk/harness';
import { extractHarnessPromptContent } from '@ai-sdk/harness/utils';
import { z } from 'zod/v4';

export const acpContentBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    data: z.string(),
    mimeType: z.string(),
  }),
]);

export type ACPContentBlock = z.infer<typeof acpContentBlockSchema>;

export function convertHarnessPromptToACPContentBlocks({
  prompt,
  harnessId,
}: {
  prompt: HarnessV1Prompt;
  harnessId: string;
}): ACPContentBlock[] {
  if (typeof prompt === 'string') {
    return [{ type: 'text', text: prompt }];
  }
  if (typeof prompt.content === 'string') {
    return [{ type: 'text', text: prompt.content }];
  }
  if (prompt.content.every(part => part.type === 'text')) {
    return prompt.content.map(part => ({ type: 'text', text: part.text }));
  }

  try {
    const extractedContent = extractHarnessPromptContent({ prompt });
    const content = extractedContent as Exclude<
      typeof extractedContent,
      string
    >;
    return content.map(part =>
      part.type === 'text'
        ? { type: 'text', text: part.text }
        : { type: 'image', data: part.data, mimeType: part.mediaType },
    );
  } catch (cause) {
    if (!HarnessCapabilityUnsupportedError.isInstance(cause)) throw cause;
    throw new HarnessCapabilityUnsupportedError({
      harnessId,
      message: cause.message,
      cause,
    });
  }
}

export function prependACPInstructionGuidance({
  prompt,
  instructions,
}: {
  prompt: ReadonlyArray<ACPContentBlock>;
  instructions: string | undefined;
}): ACPContentBlock[] {
  const hasInstructions = instructions != null && instructions.length > 0;
  if (!hasInstructions) return [...prompt];

  const lines = [
    '<session-guidance>',
    'This block is operating guidance from the harness, not user-authored content.',
  ];
  lines.push('<instructions>', instructions, '</instructions>');
  lines.push('</session-guidance>');

  return [{ type: 'text', text: lines.join('\n') }, ...prompt];
}
