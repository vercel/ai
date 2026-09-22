import {
  jsonSchema,
  safeValidateUIMessages,
  validateUIMessages,
  type UIMessage,
} from 'ai';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';

const metadataSchema = z4.object({
  attempts: z4.number().default(0),
  label: z4.string().transform(async value => value.toUpperCase()),
});

const counterSchema = z4.object({
  count: z4.coerce.number(),
});

const legacySchema = z3.object({
  value: z3.string().transform(value => Number(value)),
});

const customSchema = jsonSchema<{ text: string }>(
  {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
  {
    validate: async value => {
      if (
        value != null &&
        typeof value === 'object' &&
        'text' in value &&
        typeof value.text === 'string'
      ) {
        return {
          success: true,
          value: { text: value.text.toUpperCase() },
        };
      }

      return { success: false, error: new Error('text must be a string') };
    },
  },
);

type Message = UIMessage<
  z4.output<typeof metadataSchema>,
  {
    counter: z4.output<typeof counterSchema>;
    legacy: z3.output<typeof legacySchema>;
    custom: { text: string };
  }
>;

const input = [
  {
    id: 'message-1',
    role: 'assistant',
    metadata: { label: 'ready' },
    parts: [
      { type: 'data-counter', data: { count: '12' } },
      { type: 'data-legacy', data: { value: '7' } },
      { type: 'data-custom', data: { text: 'hello' } },
    ],
  },
];

const dataSchemas = {
  counter: counterSchema,
  legacy: legacySchema,
  custom: customSchema,
};

function collectOutputMismatches(
  helper: string,
  messages: Array<Message>,
): Array<string> {
  const mismatches: Array<string> = [];
  const message = messages[0];

  if (message.metadata?.attempts !== 0) {
    mismatches.push(`${helper} omitted the metadata default`);
  }

  if (message.metadata?.label !== 'READY') {
    mismatches.push(`${helper} discarded the async metadata transform`);
  }

  const counterPart = message.parts.find(part => part.type === 'data-counter');
  if (counterPart?.type !== 'data-counter') {
    throw new Error(`${helper} did not return the counter data part`);
  }
  if (typeof counterPart.data.count !== 'number') {
    mismatches.push(`${helper} discarded the Zod 4 data coercion`);
  }
  try {
    if (counterPart.data.count.toFixed(0) !== '12') {
      mismatches.push(`${helper} returned the wrong numeric counter value`);
    }
  } catch {
    mismatches.push(`${helper} returned a value that throws on number methods`);
  }

  const legacyPart = message.parts.find(part => part.type === 'data-legacy');
  if (legacyPart?.type !== 'data-legacy') {
    throw new Error(`${helper} did not return the legacy data part`);
  }
  if (legacyPart.data.value !== 7) {
    mismatches.push(`${helper} discarded the Zod 3 data transform`);
  }

  const customPart = message.parts.find(part => part.type === 'data-custom');
  if (customPart?.type !== 'data-custom') {
    throw new Error(`${helper} did not return the custom data part`);
  }
  if (customPart.data.text !== 'HELLO') {
    mismatches.push(`${helper} discarded the custom validator output`);
  }

  return mismatches;
}

async function verifyControls() {
  const invalidMessages = [
    {
      id: 'invalid',
      role: 'assistant',
      parts: [{ type: 'data-counter', data: { count: 'not-a-number' } }],
    },
  ];

  let validateRejected = false;
  try {
    await validateUIMessages<Message>({
      messages: invalidMessages,
      dataSchemas,
    });
  } catch {
    validateRejected = true;
  }
  if (!validateRejected) {
    throw new Error('Control failed: validateUIMessages accepted invalid data');
  }

  const safeInvalid = await safeValidateUIMessages<Message>({
    messages: invalidMessages,
    dataSchemas,
  });
  if (safeInvalid.success) {
    throw new Error(
      'Control failed: safeValidateUIMessages accepted invalid data',
    );
  }

  const withoutSchemas = await validateUIMessages({
    messages: [
      {
        id: 'without-schemas',
        role: 'assistant',
        metadata: { untouched: 'metadata' },
        parts: [{ type: 'data-unknown', data: { untouched: 'custom data' } }],
      },
    ],
  });

  if (
    (withoutSchemas[0].metadata as { untouched?: string })?.untouched !==
      'metadata' ||
    withoutSchemas[0].parts[0].type !== 'data-unknown' ||
    (
      withoutSchemas[0].parts[0].data as {
        untouched?: string;
      }
    ).untouched !== 'custom data'
  ) {
    throw new Error('Control failed: omitted schemas changed message values');
  }
}

async function main() {
  const originalInput = JSON.stringify(input);

  const validated = await validateUIMessages<Message>({
    messages: input,
    metadataSchema,
    dataSchemas,
  });

  const safeResult = await safeValidateUIMessages<Message>({
    messages: input,
    metadataSchema,
    dataSchemas,
  });
  if (!safeResult.success) {
    throw safeResult.error;
  }

  if (JSON.stringify(input) !== originalInput) {
    throw new Error('Control failed: validation mutated the caller input');
  }

  await verifyControls();

  const mismatches = [
    ...collectOutputMismatches('validateUIMessages', validated),
    ...collectOutputMismatches('safeValidateUIMessages', safeResult.data),
  ];

  if (mismatches.length > 0) {
    console.error(mismatches.join('\n'));
    throw new Error(
      'ISSUE_21122_REPRODUCED: validateUIMessages and safeValidateUIMessages discarded parsed metadata/data schema outputs',
    );
  }

  console.log(
    'validateUIMessages and safeValidateUIMessages returned all parsed schema outputs',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
