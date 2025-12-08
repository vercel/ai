import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type StepContinueResult,
  UIMessage,
} from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
    validationEnabled = true,
    clearStepEnabled = true,
  }: {
    messages: UIMessage[];
    validationEnabled?: boolean;
    clearStepEnabled?: boolean;
  } = await req.json();

  console.log(
    `[POST] validationEnabled: ${validationEnabled}, clearStepEnabled: ${clearStepEnabled}`,
  );

  const prompt = convertToModelMessages(messages);

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: `You are a helpful assistant that generates SMS text messages. When asked to generate a text message, respond with ONLY the text message itself - no explanations, no examples, no additional text. When asked to generate a large message look to generate large text message. When asked to make up a message, make up a random message.`,
    prompt,
    onStepFinish: async (step): Promise<StepContinueResult> => {
      if (!validationEnabled) {
        return { continue: false };
      }

      const text = step.text;
      console.log(`[onStepFinish] Step text length: ${text.length}`);
      console.log(
        `[onStepFinish] Step text preview: ${text.substring(0, 100)}...`,
      );

      const hasMarkdown = /[*_`\[\]#]/.test(text);
      const tooLong = text.length > 160;
      const issues: string[] = [];

      if (hasMarkdown) {
        issues.push('contains markdown symbols');
      }
      if (tooLong) {
        issues.push(`is ${text.length} characters (max 160)`);
      }

      if (issues.length > 0) {
        console.log(
          `[onStepFinish] Validation failed: ${issues.join(' and ')}`,
        );
        console.log(
          `[onStepFinish] Continuing with feedback... clearStepEnabled=${clearStepEnabled}`,
        );
        return {
          continue: true,
          messages: [
            {
              role: 'user',
              content: `Validation failed: The message ${issues.join(' and ')}. Please regenerate a plain text message without markdown and under 160 characters.`,
            },
          ],
          experimental_clearStep: clearStepEnabled,
        };
      }

      console.log(
        `[onStepFinish] Validation passed! Text length: ${text.length}`,
      );
      return { continue: false };
    },
    stopWhen: stepCountIs(5), // Safety limit: max 5 attempts
  });

  return result.toUIMessageStreamResponse();
}
