import { openai } from '@ai-sdk/openai';
import { generateObject, type StepContinueResult } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

const UserSchema = z.object({
  name: z.string().min(3).max(50),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
  // Bio is required and must be at least 100 characters - no upper limit
  bio: z.string().min(100),
});

export async function POST(req: Request) {
  const {
    prompt: promptText,
    validationEnabled = true,
  }: {
    prompt?: string;
    validationEnabled?: boolean;
  } = await req.json();

  console.log(`[POST] validationEnabled: ${validationEnabled}`);

  const prompt =
    promptText ||
    'Generate a user object with name "Jo", email "test@example.com", a young age, and a short bio.';

  const steps: Array<{
    attempt: number;
    text: string;
    validationStatus: 'pending' | 'passed' | 'failed' | 'skipped';
    validationError?: string;
    rawValidationError?: string;
    feedbackMessage?: string;
    object?: unknown;
  }> = [];

  let attemptCount = 0;

  try {
    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      system: `You are a helpful assistant that generates user objects. When asked to generate a user object, respond with ONLY valid JSON matching the schema - no explanations, no examples, no additional text.`,
      prompt,
      schema: UserSchema,
      onStepFinish: async (step): Promise<StepContinueResult> => {
        attemptCount++;
        const text = step.text;

        if (!validationEnabled) {
          // When validation is disabled, track the step but don't retry on validation failure
          // Note: generateObject still validates internally, but we don't use it to retry
          if (step.validationError) {
            steps.push({
              attempt: attemptCount,
              text,
              validationStatus: 'skipped',
              validationError: step.validationError.message,
            });
            console.log(
              `[onStepFinish] Attempt ${attemptCount}: Validation failed but retry disabled: ${step.validationError.message}`,
            );
            // Still throw the error since generateObject requires valid objects
            // But we've tracked it for UI display
          } else {
            steps.push({
              attempt: attemptCount,
              text,
              validationStatus: 'skipped',
              object: step.object,
            });
            console.log(
              `[onStepFinish] Attempt ${attemptCount}: Validation skipped (disabled)`,
            );
          }
          return { continue: false };
        }

        console.log(
          `[onStepFinish] Attempt ${attemptCount}: Step text: ${text}`,
        );
        console.log(
          `[onStepFinish] Validation error: ${step.validationError?.message}`,
        );

        if (step.validationError) {
          const issues: string[] = [];
          const errorMessage =
            step.validationError.message || String(step.validationError);

          // Try to parse the JSON to check actual values
          let parsedData: any = null;
          try {
            parsedData = JSON.parse(text);
          } catch {
            // If parsing fails, we'll rely on error message parsing
          }

          // Check for common validation failures
          if (
            errorMessage.includes('name') ||
            errorMessage.includes('String') ||
            errorMessage.includes('Expected string') ||
            text.includes('"Jo"') || // Specific check for the short name we're testing
            (parsedData?.name &&
              (parsedData.name.length < 3 || parsedData.name.length > 50))
          ) {
            issues.push('name must be 3-50 characters');
          }
          if (
            errorMessage.includes('email') ||
            errorMessage.includes('Invalid email') ||
            (parsedData?.email && !parsedData.email.includes('@'))
          ) {
            issues.push('email must be a valid email address');
          }
          if (
            errorMessage.includes('age') ||
            errorMessage.includes('Number') ||
            errorMessage.includes('Expected number') ||
            errorMessage.includes('too_small') ||
            errorMessage.includes('too_big') ||
            (parsedData?.age && (parsedData.age < 18 || parsedData.age > 120))
          ) {
            issues.push('age must be an integer between 18 and 120');
          }

          // Check bio length directly from parsed data or text
          if (parsedData?.bio !== undefined) {
            const bioLength = String(parsedData.bio).length;
            if (bioLength < 100) {
              issues.push('bio must be at least 100 characters long');
            }
          } else if (
            errorMessage.includes('bio') ||
            errorMessage.includes('too_small') ||
            errorMessage.includes('Expected string') ||
            !text.includes('"bio"') ||
            (text.includes('"bio"') && text.match(/"bio"\s*:\s*"([^"]{0,99})"/))
          ) {
            issues.push(
              'bio must be provided and at least 100 characters long',
            );
          }

          // If we couldn't parse specific issues, use the raw error message
          const validationErrorMsg =
            issues.length > 0
              ? issues.join(', ')
              : `Schema validation failed: ${errorMessage}`;

          const feedbackMessage = `Validation failed: ${validationErrorMsg}. Please regenerate a valid user object with name (3-50 chars), valid email, age (18-120 integer), and bio (at least 100 chars, no upper limit).`;

          steps.push({
            attempt: attemptCount,
            text,
            validationStatus: 'failed',
            validationError: validationErrorMsg,
            rawValidationError: errorMessage,
            feedbackMessage: feedbackMessage,
          });

          console.log(
            `[onStepFinish] Validation failed: ${validationErrorMsg}`,
          );
          console.log(`[onStepFinish] Raw error: ${errorMessage}`);
          console.log(`[onStepFinish] Continuing with feedback...`);
          console.log(`[onStepFinish] Feedback message: ${feedbackMessage}`);

          return {
            continue: true,
            messages: [
              {
                role: 'user',
                content: feedbackMessage,
              },
            ],
          };
        }

        if (step.object) {
          steps.push({
            attempt: attemptCount,
            text,
            validationStatus: 'passed',
            object: step.object,
          });
          console.log(
            `[onStepFinish] Validation passed! Object: ${JSON.stringify(step.object)}`,
          );
        }

        return { continue: false };
      },
      maxRetries: 5, // Safety limit: max 5 attempts
    });

    return Response.json({
      object: result.object,
      finishReason: result.finishReason,
      usage: result.usage,
      steps,
      attemptCount,
      validationEnabled,
    });
  } catch (error: any) {
    // If validation failed and retries are disabled, return error info
    return Response.json(
      {
        error: error.message || 'Failed to generate object',
        steps,
        attemptCount,
        validationEnabled,
        validationFailed: true,
      },
      { status: 400 },
    );
  }
}
