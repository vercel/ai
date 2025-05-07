import { LanguageModelV2Content } from '@ai-sdk/provider';
import { ContentPart } from './content-part';
import { DefaultGeneratedFile, GeneratedFile } from './generated-file';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';
import { ToolSet } from './tool-set';

export function asContent<TOOLS extends ToolSet>({
  content,
  toolCalls,
  toolResults,
}: {
  content: Array<LanguageModelV2Content>;
  toolCalls: ToolCallArray<TOOLS>;
  toolResults: ToolResultArray<TOOLS>;
}): Array<ContentPart<TOOLS>> {
  return [
    ...content.map(part => {
      switch (part.type) {
        case 'text':
        case 'reasoning':
        case 'source':
          return part;

        case 'file': {
          return {
            type: 'file' as const,
            file: new DefaultGeneratedFile(part),
          };
        }

        case 'tool-call': {
          return toolCalls.find(
            toolCall => toolCall.toolCallId === part.toolCallId,
          )!;
        }
      }
    }),
    ...toolResults,
  ];
}

export function extractFiles(
  content: Array<ContentPart<ToolSet>>,
): Array<GeneratedFile> {
  return content.filter(part => part.type === 'file').map(part => part.file);
}

export function extractReasoning(
  content: Array<ContentPart<ToolSet>>,
): Array<ContentPart<ToolSet> & { type: 'reasoning' }> {
  return content.filter(part => part.type === 'reasoning');
}
