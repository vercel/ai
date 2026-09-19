import { jsonSchema } from '@ai-sdk/provider-utils';
import { safeValidateUIMessages, type UIMessage, validateUIMessages } from 'ai';
import { z as z3 } from 'zod/v3';
import { z as z4 } from 'zod/v4';

const primaryFailures: string[] = [];

function checkParsedOutput(condition: boolean, failure: string) {
  if (!condition) {
    primaryFailures.push(failure);
  }
}

function assertControl(condition: boolean, failure: string): asserts condition {
  if (!condition) {
    throw new Error(`CONTROL_FAILURE: ${failure}`);
  }
}

async function main() {
  const metadataSchema = z4.object({
    attempts: z4.number().default(0),
  });
  const dataSchema = z4.object({
    count: z4.coerce.number(),
  });
  type Message = UIMessage<
    z4.infer<typeof metadataSchema>,
    { counter: z4.infer<typeof dataSchema> }
  >;

  const callerMessages = [
    {
      id: 'message-1',
      role: 'assistant',
      metadata: {},
      parts: [{ type: 'data-counter', data: { count: '12' } }],
    },
  ];
  const callerMessagesBeforeValidation = structuredClone(callerMessages);

  const validated = await validateUIMessages<Message>({
    messages: callerMessages,
    metadataSchema,
    dataSchemas: { counter: dataSchema },
  });

  const validatedPart = validated[0].parts[0];
  assertControl(
    validatedPart.type === 'data-counter',
    'validateUIMessages returned the wrong part type',
  );
  checkParsedOutput(
    validated[0].metadata?.attempts === 0,
    'validateUIMessages discarded a metadata default',
  );
  checkParsedOutput(
    validatedPart.data.count === 12 &&
      typeof validatedPart.data.count === 'number',
    'validateUIMessages discarded custom-data coercion',
  );

  let formattedCount: string | undefined;
  try {
    formattedCount = validatedPart.data.count.toFixed(0);
  } catch {
    // This is the reported user-visible runtime failure.
  }
  checkParsedOutput(
    formattedCount === '12',
    'the number-typed custom data throws when a number method is called',
  );
  assertControl(
    JSON.stringify(callerMessages) ===
      JSON.stringify(callerMessagesBeforeValidation),
    'validateUIMessages mutated the caller input',
  );

  const asyncMetadataSchema = z4.object({
    label: z4.string().transform(async value => value.toUpperCase()),
  });
  const asyncDataSchema = z4.object({
    value: z4.string().transform(async value => Number(value)),
  });
  type AsyncMessage = UIMessage<
    z4.infer<typeof asyncMetadataSchema>,
    { async: z4.infer<typeof asyncDataSchema> }
  >;

  const safeResult = await safeValidateUIMessages<AsyncMessage>({
    messages: [
      {
        id: 'message-2',
        role: 'assistant',
        metadata: { label: 'ready' },
        parts: [{ type: 'data-async', data: { value: '7' } }],
      },
    ],
    metadataSchema: asyncMetadataSchema,
    dataSchemas: { async: asyncDataSchema },
  });
  assertControl(
    safeResult.success,
    'safeValidateUIMessages rejected valid async transforms',
  );
  const safePart = safeResult.data[0].parts[0];
  assertControl(
    safePart.type === 'data-async',
    'safeValidateUIMessages returned the wrong part type',
  );
  checkParsedOutput(
    safeResult.data[0].metadata?.label === 'READY',
    'safeValidateUIMessages discarded an async metadata transform',
  );
  checkParsedOutput(
    safePart.data.value === 7 && typeof safePart.data.value === 'number',
    'safeValidateUIMessages discarded an async custom-data transform',
  );

  const zod3MetadataSchema = z3.object({
    legacy: z3.coerce.number(),
  });
  const zod3DataSchema = z3.object({
    legacy: z3.coerce.number(),
  });
  type Zod3Message = UIMessage<
    z3.infer<typeof zod3MetadataSchema>,
    { legacy: z3.infer<typeof zod3DataSchema> }
  >;
  const zod3Result = await validateUIMessages<Zod3Message>({
    messages: [
      {
        id: 'message-3',
        role: 'assistant',
        metadata: { legacy: '3' },
        parts: [{ type: 'data-legacy', data: { legacy: '4' } }],
      },
    ],
    metadataSchema: zod3MetadataSchema,
    dataSchemas: { legacy: zod3DataSchema },
  });
  const zod3Part = zod3Result[0].parts[0];
  assertControl(
    zod3Part.type === 'data-legacy',
    'Zod 3 validation returned the wrong part type',
  );
  checkParsedOutput(
    zod3Result[0].metadata?.legacy === 3,
    'validateUIMessages discarded Zod 3 metadata coercion',
  );
  checkParsedOutput(
    zod3Part.data.legacy === 4,
    'validateUIMessages discarded Zod 3 custom-data coercion',
  );

  const customMetadataSchema = jsonSchema<{ normalized: string }>(
    { type: 'object' },
    {
      validate: async () => ({
        success: true,
        value: { normalized: 'metadata-output' },
      }),
    },
  );
  const customDataSchema = jsonSchema<{ normalized: string }>(
    { type: 'object' },
    {
      validate: async () => ({
        success: true,
        value: { normalized: 'data-output' },
      }),
    },
  );
  type CustomMessage = UIMessage<
    { normalized: string },
    { custom: { normalized: string } }
  >;
  const customResult = await safeValidateUIMessages<CustomMessage>({
    messages: [
      {
        id: 'message-4',
        role: 'assistant',
        metadata: { normalized: 'metadata-input' },
        parts: [
          {
            type: 'data-custom',
            data: { normalized: 'data-input' },
          },
        ],
      },
    ],
    metadataSchema: customMetadataSchema,
    dataSchemas: { custom: customDataSchema },
  });
  assertControl(
    customResult.success,
    'safeValidateUIMessages rejected valid custom validators',
  );
  const customPart = customResult.data[0].parts[0];
  assertControl(
    customPart.type === 'data-custom',
    'custom validation returned the wrong part type',
  );
  checkParsedOutput(
    customResult.data[0].metadata?.normalized === 'metadata-output',
    'safeValidateUIMessages discarded custom metadata validator output',
  );
  checkParsedOutput(
    customPart.data.normalized === 'data-output',
    'safeValidateUIMessages discarded custom data validator output',
  );

  let invalidMetadataRejected = false;
  try {
    await validateUIMessages<Message>({
      messages: [
        {
          id: 'invalid-metadata',
          role: 'assistant',
          metadata: { attempts: 'invalid' },
          parts: [{ type: 'data-counter', data: { count: '1' } }],
        },
      ],
      metadataSchema,
      dataSchemas: { counter: dataSchema },
    });
  } catch {
    invalidMetadataRejected = true;
  }
  assertControl(
    invalidMetadataRejected,
    'validateUIMessages accepted invalid metadata',
  );

  const invalidDataResult = await safeValidateUIMessages<Message>({
    messages: [
      {
        id: 'invalid-data',
        role: 'assistant',
        metadata: {},
        parts: [{ type: 'data-counter', data: { count: 'not-a-number' } }],
      },
    ],
    metadataSchema,
    dataSchemas: { counter: dataSchema },
  });
  assertControl(
    !invalidDataResult.success,
    'safeValidateUIMessages accepted invalid custom data',
  );

  const withoutSchemas = await validateUIMessages({
    messages: [
      {
        id: 'message-5',
        role: 'assistant',
        metadata: { untouched: true },
        parts: [{ type: 'data-unchecked', data: { untouched: true } }],
      },
    ],
  });
  assertControl(
    JSON.stringify(withoutSchemas[0]) ===
      JSON.stringify({
        id: 'message-5',
        role: 'assistant',
        metadata: { untouched: true },
        parts: [{ type: 'data-unchecked', data: { untouched: true } }],
      }),
    'omitting schemas changed otherwise valid message values',
  );

  console.log(
    JSON.stringify(
      {
        validateUIMessages: validated,
        safeValidateUIMessages: safeResult.data,
        zod3: zod3Result,
        customValidators: customResult.data,
      },
      null,
      2,
    ),
  );

  if (primaryFailures.length > 0) {
    console.error(primaryFailures.map(failure => `- ${failure}`).join('\n'));
    throw new Error(
      'ISSUE_21122_REPRODUCED: parsed metadata and custom-data outputs were discarded',
    );
  }
}

main();
