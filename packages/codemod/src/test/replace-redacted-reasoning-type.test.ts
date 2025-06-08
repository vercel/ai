import { describe, it, expect } from 'vitest';
import { FileInfo, API } from 'jscodeshift';
import transform from '../codemods/replace-redacted-reasoning-type';

describe('replace-redacted-reasoning-type', () => {
  it('should detect redacted-reasoning usages and add guidance messages', () => {
    const fileInfo: FileInfo = {
      path: 'test.ts',
      source: `
import { streamText } from 'ai';
import { bedrock } from '@ai-sdk/bedrock';

const result = streamText({
  model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
  messages: [],
});

// Example 1: if condition with type comparison
for await (const part of result.fullStream) {
  if (part.type === 'reasoning') {
    console.log(part.text);
  } else if (part.type === 'redacted-reasoning') {
    console.log('<redacted>');
  } else if (part.type === 'text-delta') {
    console.log(part.textDelta);
  }
}

// Example 2: switch case
for await (const part of result.fullStream) {
  switch (part.type) {
    case 'reasoning':
      console.log(part.text);
      break;
    case 'redacted-reasoning':
      console.log('<redacted>');
      break;
    case 'text-delta':
      console.log(part.textDelta);
      break;
  }
}

// Example 3: function parameter
function handlePart(type) {
  if (type === 'redacted-reasoning') {
    return 'REDACTED';
  }
  return type;
}
      `.trim(),
    };

    const messages: string[] = [];
    const api: API = {
      jscodeshift: require('jscodeshift'),
      report: (message: string) => {
        messages.push(message);
      },
    } as any;

    const result = transform(fileInfo, api, {});

    // Should not transform the code (return null for no changes)
    expect(result).toBeNull();

    // Should have captured messages via api.report
    expect(messages.length).toBeGreaterThan(0);

    expect(messages[0]).toContain(
      "Found 3 usage(s) of 'redacted-reasoning' part type that need migration:",
    );

    const allMessages = messages.join('\n');
    expect(allMessages).toContain('type comparison');
    expect(allMessages).toContain('switch case');
    expect(allMessages).toContain('unknown context');

    // Check migration guidance is present
    expect(allMessages).toContain('Migration required:');
    expect(allMessages).toContain(
      'The redacted-reasoning part type has been removed.',
    );
    expect(allMessages).toContain(
      'part.providerMetadata?.anthropic?.redactedData != null',
    );
  });

  it('should not report anything for code without redacted-reasoning usage', () => {
    const fileInfo: FileInfo = {
      path: 'test.ts',
      source: `
import { streamText } from 'ai';
import { bedrock } from '@ai-sdk/bedrock';

const result = streamText({
  model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
  messages: [],
});

for await (const part of result.fullStream) {
  if (part.type === 'reasoning') {
    console.log(part.text);
  } else if (part.type === 'text-delta') {
    console.log(part.textDelta);
  }
}
      `.trim(),
    };

    const messages: string[] = [];
    const api: API = {
      jscodeshift: require('jscodeshift'),
      report: (message: string) => {
        messages.push(message);
      },
    } as any;

    const result = transform(fileInfo, api, {});

    // Should not transform the code (return null for no changes)
    expect(result).toBeNull();

    // Should not have any messages
    expect(messages).toHaveLength(0);
  });
});
