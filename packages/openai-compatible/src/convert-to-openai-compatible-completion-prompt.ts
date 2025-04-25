import {
  InvalidPromptError,
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

export function convertToOpenAICompatibleCompletionPrompt({
  prompt,
  user = 'user',
  assistant = 'assistant',
}: {
  prompt: LanguageModelV2Prompt;
  user?: string;
  assistant?: string;
}): {
  prompt: string;
  stopSequences?: string[];
} {
  // transform to a chat message format:
  let text = '';

  // if first message is a system message, add it to the text:
  if (prompt[0].role === 'system') {
    text += `${prompt[0].content}\n\n`;
    prompt = prompt.slice(1);
  }

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        throw new InvalidPromptError({
          message: 'Unexpected system message in prompt: ${content}',
          prompt,
        });
      }

      case 'user': {
        const userMessage = content
          .map(part => {
            switch (part.type) {
              case 'text': {
                return part.text;
              }
            }
          })
          .filter(Boolean)
          .join('');

        text += `${user}:\n${userMessage}\n\n`;
        break;
      }

      case 'assistant': {
        const assistantMessage = content
          .map(part => {
            switch (part.type) {
              case 'text': {
                return part.text;
              }
              case 'tool-call': {
                throw new UnsupportedFunctionalityError({
                  functionality: 'tool-call messages',
                });
              }
            }
          })
          .join('');

        text += `${assistant}:\n${assistantMessage}\n\n`;
        break;
      }

      case 'tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'tool messages',
        });
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  // Assistant message prefix:
  text += `${assistant}:\n`;

  return {
    prompt: text,
    stopSequences: [`\n${user}:`],
  };
}
