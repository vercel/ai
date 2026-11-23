import { describe, expect, it } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import { MockScreen, MockUserInput } from '../test/mock-terminal';
import { TerminalRenderer } from './terminal-renderer';

// Harmless clipboard content; output is captured in memory, never sent to a terminal.
const payload = '\x1b]52;c;dGVzdA==\x07\x1bPtest\x1b\\\x9dtest\x9c\x1b[8m';

function expectSafeOutput(screen: MockScreen) {
  const output = screen.rawOutput();
  expect(output).not.toContain('\x1b]');
  expect(output).not.toContain('\x1bP');
  expect(output).not.toContain('\x1b[8m');
  expect(output).not.toContain('\x07');
  expect(output).not.toContain('\x9d');
  expect(output).not.toContain('\x9c');
  expect(output).toContain('\\u001b');
}

function createTerminal() {
  const screen = new MockScreen({ columns: 180, rows: 40 });
  const input = new MockUserInput();
  const renderer = new TerminalRenderer({
    input,
    output: screen,
    tools: 'full',
    reasoning: 'full',
  });
  return { screen, input, renderer };
}

describe('terminal output sanitization', () => {
  it.each(['text', 'reasoning'] as const)(
    'escapes every streamed prefix of %s without changing the response',
    async type => {
      const { screen, renderer } = createTerminal();
      const response = await renderer.renderStream(
        {
          uiMessageStream: (async function* (): AsyncIterable<UIMessageChunk> {
            yield { type: 'start', messageId: 'message-1' };
            yield { type: `${type}-start`, id: 'part-1' };
            for (const delta of payload) {
              yield { type: `${type}-delta`, id: 'part-1', delta };
            }
            yield { type: `${type}-end`, id: 'part-1' };
            yield { type: 'finish' };
          })(),
        },
        { waitForExit: false },
      );

      expectSafeOutput(screen);
      expect(response?.parts[0]).toMatchObject({ type, text: payload });
      expect(screen.rawOutput()).toContain('\x1b[?1049h');
      expect(screen.rawOutput()).toContain('\x1b[?1049l');
    },
  );

  const toolPart = {
    type: 'dynamic-tool',
    toolName: 'test',
    toolCallId: 'call-1',
    state: 'output-available',
    input: 'input',
    output: 'output',
  } as const;

  it.each([
    { name: 'tool name', part: { ...toolPart, toolName: payload } },
    { name: 'tool title', part: { ...toolPart, title: payload } },
    { name: 'tool input', part: { ...toolPart, input: payload } },
    { name: 'tool output', part: { ...toolPart, output: payload } },
    {
      name: 'structured tool output',
      part: { ...toolPart, output: { value: payload } },
    },
    {
      name: 'tool error',
      part: {
        ...toolPart,
        state: 'output-error',
        output: undefined,
        errorText: payload,
      },
    },
    {
      name: 'denial reason',
      part: {
        ...toolPart,
        state: 'output-denied',
        output: undefined,
        approval: { id: 'approval-1', approved: false, reason: payload },
      },
    },
  ] satisfies Array<{ name: string; part: UIMessage['parts'][number] }>)(
    'escapes $name',
    async ({ part }) => {
      const { screen, renderer } = createTerminal();
      await renderer.renderStream(
        {
          message: { id: 'message-1', role: 'assistant', parts: [part] },
          uiMessageStream: (async function* () {
            yield {
              type: 'finish' as const,
              messageMetadata: { complete: true },
            };
          })(),
        },
        { waitForExit: false },
      );
      expectSafeOutput(screen);
    },
  );

  it('shows invisible format characters in tool cards and approval prompts', async () => {
    const { screen, input, renderer } = createTerminal();
    await renderer.renderStream(
      {
        message: {
          id: 'message-1',
          role: 'assistant',
          parts: [
            {
              ...toolPart,
              title: 'ti\u2066tle',
              output: 'admin\u200b@example.com',
            },
          ],
        },
        uiMessageStream: (async function* () {
          yield {
            type: 'finish' as const,
            messageMetadata: { complete: true },
          };
        })(),
      },
      { continueSession: true, waitForExit: false },
    );
    const approval = renderer.readToolApproval({
      approvalId: 'approval-1',
      toolCallId: 'call-2',
      toolName: 'na\u2067me',
      input: 'report_\u202efdp.exe\u{e0041}',
      messageId: 'message-1',
      partIndex: 1,
    });
    input.type('n');
    await approval;

    expect(screen.rawOutput()).not.toMatch(/\p{Cf}/u);
    expect(screen.rawOutput()).toContain('Tool · ti\\u{2066}tle');
    expect(screen.rawOutput()).toContain('Approve tool na\\u{2067}me? y/n');
    expect(screen.rawOutput()).toContain('admin\\u{200b}@example.com');
    expect(screen.rawOutput()).toContain('report_\\u{202e}fdp.exe\\u{e0041}');
  });

  it('keeps format characters in assistant text', async () => {
    const { screen, renderer } = createTerminal();
    await renderer.renderStream(
      {
        uiMessageStream: (async function* (): AsyncIterable<UIMessageChunk> {
          yield { type: 'start', messageId: 'message-1' };
          yield { type: 'text-start', id: 'part-1' };
          yield { type: 'text-delta', id: 'part-1', delta: '👩\u200d💻' };
          yield { type: 'text-end', id: 'part-1' };
          yield { type: 'finish' };
        })(),
      },
      { waitForExit: false },
    );

    expect(screen.rawOutput()).toContain('👩\u200d💻');
  });

  it('escapes stream errors', async () => {
    const { screen, renderer } = createTerminal();
    await renderer.renderStream(
      {
        uiMessageStream: (async function* () {
          yield { type: 'error' as const, errorText: payload };
        })(),
      },
      { waitForExit: false },
    );
    expectSafeOutput(screen);
  });

  it('escapes the title and prompt display while preserving submitted input', async () => {
    const { screen, input, renderer } = createTerminal();
    const prompt = renderer.readPrompt({
      title: payload,
      initialPrompt: payload,
    });
    input.enter();
    await expect(prompt).resolves.toBe(payload);
    expectSafeOutput(screen);
  });

  it.each(['toolName', 'title', 'input'] as const)(
    'escapes approval %s',
    async field => {
      const { screen, input, renderer } = createTerminal();
      const approval = renderer.readToolApproval({
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        toolName: 'test',
        input: {},
        messageId: 'message-1',
        partIndex: 0,
        [field]: payload,
      });
      input.type('n');
      await expect(approval).resolves.toMatchObject({ approved: false });
      expectSafeOutput(screen);
    },
  );
});
