import { generateText, gateway, tool } from 'ai';
import { z } from 'zod/v4';

const FAILURE_SIGNAL =
  'ISSUE_21350_REPRODUCED: Anthropic rejected the root-union tool schema with HTTP 400 instead of an actionable preflight validation error.';

type Attempt = { ok: true; text: string } | { ok: false; error: unknown };

function getErrorDetails(error: unknown) {
  if (error == null || typeof error !== 'object') {
    return { message: String(error), statusCode: undefined };
  }

  const errorRecord = error as Record<string, unknown>;
  return {
    message:
      typeof errorRecord.message === 'string'
        ? errorRecord.message
        : String(error),
    statusCode:
      typeof errorRecord.statusCode === 'number'
        ? errorRecord.statusCode
        : undefined,
  };
}

async function attempt(inputSchema: z.ZodType): Promise<Attempt> {
  try {
    const result = await generateText({
      model: gateway('anthropic/claude-sonnet-4-6'),
      prompt: 'Do not call tools. Reply only OK.',
      tools: {
        lookup: tool({
          description: 'Look up an item or search for items.',
          inputSchema,
        }),
      },
      maxRetries: 0,
      maxOutputTokens: 64,
      abortSignal: AbortSignal.timeout(45_000),
    });

    return { ok: true, text: result.text };
  } catch (error) {
    return { ok: false, error };
  }
}

async function main() {
  const request = z.discriminatedUnion('action', [
    z.object({ action: z.literal('lookup'), id: z.string() }),
    z.object({ action: z.literal('search'), query: z.string() }),
  ]);

  const rootUnion = await attempt(request);
  const wrappedUnion = await attempt(z.object({ request }));

  if (!wrappedUnion.ok) {
    throw wrappedUnion.error;
  }

  if (rootUnion.ok) {
    throw new Error(
      'Expected Anthropic to reject the unsupported root-union tool schema.',
    );
  }

  const { message, statusCode } = getErrorDetails(rootUnion.error);

  if (
    statusCode === 400 &&
    message.includes('tools.0.custom.input_schema.type: Field required')
  ) {
    console.error(FAILURE_SIGNAL);
    process.exitCode = 1;
    return;
  }

  const isActionablePreflightError =
    statusCode == null &&
    message.includes('lookup') &&
    /object/i.test(message) &&
    /(property|nested|wrap|beneath)/i.test(message);

  if (!isActionablePreflightError) {
    throw rootUnion.error;
  }

  console.log(
    `Anthropic rejected the incompatible tool locally and the wrapped schema succeeded with: ${wrappedUnion.text}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
