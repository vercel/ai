import type { StartMessage } from '../opencode-bridge-protocol';

export function toOpenCodePromptParts(prompt: StartMessage['prompt']) {
  if (typeof prompt === 'string') {
    return [{ type: 'text' as const, text: prompt }];
  }

  return prompt.map(part =>
    part.type === 'text'
      ? { type: 'text' as const, text: part.text }
      : {
          type: 'file' as const,
          mime: part.mediaType,
          url: `data:${part.mediaType};base64,${part.data}`,
        },
  );
}
