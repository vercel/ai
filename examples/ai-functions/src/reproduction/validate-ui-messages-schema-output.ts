import { validator } from '@ai-sdk/provider-utils';
import { safeValidateUIMessages, type UIMessage, validateUIMessages } from 'ai';
import { z as z3 } from 'zod/v3';
import { z as z4 } from 'zod/v4';

const metadataSchema = z4.object({
  attempts: z4.number().default(0),
  label: z4.string().transform(async value => value.toUpperCase()),
});

const dataSchemas = {
  counter: z4.object({ count: z4.coerce.number() }),
  zod3: z3.object({ value: z3.coerce.number() }),
  custom: validator<{ value: string }>(value => ({
    success: true,
    value: { value: String((value as { value: unknown }).value).toUpperCase() },
  })),
};

type Message = UIMessage<
  z4.infer<typeof metadataSchema>,
  {
    counter: z4.infer<(typeof dataSchemas)['counter']>;
    zod3: z3.infer<(typeof dataSchemas)['zod3']>;
    custom: { value: string };
  }
>;

const originalMessages = [
  {
    id: 'message-1',
    role: 'assistant',
    metadata: { label: 'stored' },
    parts: [
      { type: 'data-counter', data: { count: '12' } },
      { type: 'data-zod3', data: { value: '7' } },
      { type: 'data-custom', data: { value: 'stored' } },
    ],
  },
];

const originalSnapshot = structuredClone(originalMessages);

function parsedOutputFailures(messages: Message[], helper: string): string[] {
  const failures: string[] = [];
  const message = messages[0];

  if (message.metadata?.attempts !== 0) {
    failures.push(`${helper} omitted the metadata default`);
  }

  if (message.metadata?.label !== 'STORED') {
    failures.push(`${helper} omitted the async metadata transform`);
  }

  const counterPart = message.parts.find(part => part.type === 'data-counter');
  if (counterPart?.type !== 'data-counter') {
    throw new Error(`${helper} unexpectedly removed data-counter`);
  }

  const typedCount: number = counterPart.data.count;
  if (typedCount !== 12 || typeof typedCount !== 'number') {
    failures.push(`${helper} omitted the Zod 4 data coercion`);
  }

  try {
    if (typedCount.toFixed(0) !== '12') {
      failures.push(`${helper} returned an unusable typed count`);
    }
  } catch {
    failures.push(`${helper} made typed count.toFixed() throw`);
  }

  const zod3Part = message.parts.find(part => part.type === 'data-zod3');
  if (zod3Part?.type !== 'data-zod3') {
    throw new Error(`${helper} unexpectedly removed data-zod3`);
  }
  if (zod3Part.data.value !== 7 || typeof zod3Part.data.value !== 'number') {
    failures.push(`${helper} omitted the Zod 3 data coercion`);
  }

  const customPart = message.parts.find(part => part.type === 'data-custom');
  if (customPart?.type !== 'data-custom') {
    throw new Error(`${helper} unexpectedly removed data-custom`);
  }
  if (customPart.data.value !== 'STORED') {
    failures.push(`${helper} omitted the custom-validator output`);
  }

  return failures;
}

async function assertControls(): Promise<void> {
  const invalid = await safeValidateUIMessages<Message>({
    messages: [
      {
        id: 'invalid',
        role: 'assistant',
        metadata: { attempts: 'invalid', label: 'stored' },
        parts: [],
      },
    ],
    metadataSchema,
  });

  if (invalid.success) {
    throw new Error('Invalid metadata unexpectedly passed validation');
  }

  const withoutSchemas = await validateUIMessages({
    messages: originalMessages,
  });

  if (JSON.stringify(withoutSchemas) !== JSON.stringify(originalMessages)) {
    throw new Error('Omitted schemas unexpectedly changed message values');
  }

  if (JSON.stringify(originalMessages) !== JSON.stringify(originalSnapshot)) {
    throw new Error('Validation unexpectedly mutated the caller input');
  }
}

async function main(): Promise<void> {
  const validated = await validateUIMessages<Message>({
    messages: originalMessages,
    metadataSchema,
    dataSchemas,
  });

  const safeResult = await safeValidateUIMessages<Message>({
    messages: originalMessages,
    metadataSchema,
    dataSchemas,
  });

  if (!safeResult.success) {
    throw safeResult.error;
  }

  await assertControls();

  const failures = [
    ...parsedOutputFailures(validated, 'validateUIMessages'),
    ...parsedOutputFailures(safeResult.data, 'safeValidateUIMessages'),
  ];

  if (failures.length > 0) {
    throw new Error(
      [
        'ISSUE_21122: validated UI messages discarded parsed schema outputs',
        ...failures,
      ].join('\n'),
    );
  }

  console.log('Schema defaults, coercions, and transformations were retained.');
}

main();
