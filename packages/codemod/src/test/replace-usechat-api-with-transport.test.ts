import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v5/replace-usechat-api-with-transport';
import { applyTransform, testTransform } from './test-utils';

describe('replace-usechat-api-with-transport', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-usechat-api-with-transport');
  });

  it('reuses an aliased DefaultChatTransport value import from ai', () => {
    const output = applyTransform(
      transformer,
      `import { DefaultChatTransport as ChatTransport } from 'ai';
import { useChat } from 'ai/react';

useChat({ api: '/api/chat' });`,
    );

    expect(output).toContain("import { useChat } from '@ai-sdk/react';");
    expect(output).toContain(
      "import { DefaultChatTransport as ChatTransport } from 'ai';",
    );
    expect(output).toContain('transport: new ChatTransport({');
  });

  it('reuses an ai namespace import', () => {
    const output = applyTransform(
      transformer,
      `import * as AI from 'ai';
import { useChat } from 'ai/react';

useChat({ api: '/api/chat' });`,
    );

    expect(output).toContain("import * as AI from 'ai';");
    expect(output).toContain('transport: new AI.DefaultChatTransport({');
  });

  it('adds a value import alongside a type-only ai import', () => {
    const output = applyTransform(
      transformer,
      `import type { DefaultChatTransport } from 'ai';
import { useChat } from 'ai/react';

useChat({ api: '/api/chat' });`,
    );

    expect(output).toContain(
      "import { DefaultChatTransport as DefaultChatTransportValue } from 'ai';",
    );
    expect(output).toContain('transport: new DefaultChatTransportValue({');
  });
});
