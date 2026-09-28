import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1Prompt,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';

export const acpTextContentBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export type ACPTextContentBlock = z.infer<typeof acpTextContentBlockSchema>;

export function convertHarnessPromptToACPTextBlocks({
  prompt,
  harnessId,
}: {
  prompt: HarnessV1Prompt;
  harnessId: string;
}): ACPTextContentBlock[] {
  if (typeof prompt === 'string') {
    return [{ type: 'text', text: prompt }];
  }
  if (typeof prompt.content === 'string') {
    return [{ type: 'text', text: prompt.content }];
  }

  const content: ACPTextContentBlock[] = [];
  for (const part of prompt.content) {
    if (part.type === 'text') {
      content.push({ type: 'text', text: part.text });
      continue;
    }
    if (part.type === 'image') {
      throw unsupportedPromptContent({
        harnessId,
        category: 'image content',
      });
    }
    if (part.type === 'file') {
      const mediaCategory = part.mediaType.toLowerCase().split('/', 1)[0];
      if (mediaCategory === 'image') {
        throw unsupportedPromptContent({
          harnessId,
          category: 'image content',
        });
      }
      if (mediaCategory === 'audio') {
        throw unsupportedPromptContent({
          harnessId,
          category: 'audio content',
        });
      }
      throw unsupportedPromptContent({
        harnessId,
        category: `embedded resource content with media type ${JSON.stringify(part.mediaType)}`,
      });
    }
    throw unsupportedPromptContent({
      harnessId,
      category: `content parts of type ${JSON.stringify(
        (part as { readonly type?: unknown }).type,
      )}`,
    });
  }
  return content;
}

export function prependACPInstructionGuidance({
  prompt,
  instructions,
}: {
  prompt: ReadonlyArray<ACPTextContentBlock>;
  instructions: string | undefined;
}): ACPTextContentBlock[] {
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

function unsupportedPromptContent({
  harnessId,
  category,
}: {
  harnessId: string;
  category: string;
}): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId,
    message:
      `The ${harnessId} ACP harness supports only portable text prompts and does not support ${category}. ` +
      'Pass a string or a user message whose content contains only text parts.',
  });
}
