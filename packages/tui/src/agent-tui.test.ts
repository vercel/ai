import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentTUIRenderer,
  AgentTUISessionOptions,
  AgentTUIToolApprovalRequest,
  AgentTUIToolApprovalResponse,
} from "./agent-tui-runner";

let testRenderer: AgentTUIRenderer | undefined;
let terminalRendererOptions: unknown[] = [];

vi.mock("./tui/terminal-renderer", () => ({
  TerminalRenderer: vi.fn(function TerminalRenderer(options) {
    terminalRendererOptions.push(options);

    if (!testRenderer) {
      throw new Error("Expected a test renderer.");
    }

    return testRenderer;
  }),
}));

import { runAgentTUI } from "./run-agent-tui";
import type { AgentTUIAgent } from "./run-agent-tui";
import { AgentTUIRunner } from "./agent-tui-runner";
import {
  readUIMessageStream,
  type Agent,
  type AgentStreamParameters,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

describe("runAgentTUI", () => {
  beforeEach(() => {
    testRenderer = undefined;
    terminalRendererOptions = [];
  });

  it("creates the default terminal renderer when none is provided", async () => {
    useRenderer(
      createRenderer({
        prompts: [undefined],
      }),
    );
    const agent = createAISDKAgent();

    await runAgentTUI({ agent, name: "Test Agent" });

    expect(terminalRendererOptions).toEqual([undefined]);
  });

  it("passes display modes to the default terminal renderer", async () => {
    useRenderer(
      createRenderer({
        prompts: [undefined],
      }),
    );
    const agent = createAISDKAgent();

    await runAgentTUI({
      agent,
      name: "Test Agent",
      tools: "collapsed",
      reasoning: "hidden",
    });

    expect(terminalRendererOptions).toEqual([{ tools: "collapsed", reasoning: "hidden" }]);
  });

  it("passes assistant response stats mode to the default terminal renderer", async () => {
    useRenderer(
      createRenderer({
        prompts: [undefined],
      }),
    );
    const agent = createAISDKAgent();

    await runAgentTUI({
      agent,
      name: "Test Agent",
      assistantResponseStats: "tokensPerSecond",
    });

    expect(terminalRendererOptions).toEqual([
      { assistantResponseStats: "tokensPerSecond", reasoning: undefined, tools: undefined },
    ]);
  });

  it("passes context size to the default terminal renderer", async () => {
    useRenderer(
      createRenderer({
        prompts: [undefined],
      }),
    );
    const agent = createAISDKAgent();

    await runAgentTUI({
      agent,
      name: "Test Agent",
      contextSize: 200_000,
    });

    expect(terminalRendererOptions).toEqual([
      {
        assistantResponseStats: undefined,
        contextSize: 200_000,
        reasoning: undefined,
        tools: undefined,
      },
    ]);
  });
});

describe("AgentTUIRunner", () => {
  beforeEach(() => {
    testRenderer = undefined;
    terminalRendererOptions = [];
  });

  it("prompts before the first turn", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["hello", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expectStreamCalls(streamCalls, [[createUserModelMessage("hello")]]);
    expect(renderer.submittedPrompts).toEqual(["hello"]);
  });

  it("continues prompting and passes message history", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["first", "second", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expectStreamCalls(streamCalls, [
      [createUserModelMessage("first")],
      [
        createUserModelMessage("first"),
        createAssistantModelMessage("response to first"),
        createUserModelMessage("second"),
      ],
    ]);
    expect(renderer.submittedPrompts).toEqual(["first", "second"]);
  });

  it("collects assistant text after tool calls in a multi-step stream", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    useRenderer(
      createRenderer({
        prompts: ["weather", "next", undefined],
      }),
    );
    const agent = createMultiStepAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expectStreamCalls(streamCalls, [
      [createUserModelMessage("weather")],
      [
        createUserModelMessage("weather"),
        createAssistantModelMessageWithToolInvocation(),
        createToolModelMessageWithToolInvocation(),
        createUserModelMessage("next"),
      ],
    ]);
  });

  it("continues the turn with a tool approval response", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["run command", undefined],
        toolApprovals: [{ approved: true }],
      }),
    );
    const agent = createApprovalAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expectStreamCalls(streamCalls, [
      [createUserModelMessage("run command")],
      [
        createUserModelMessage("run command"),
        createAssistantModelMessageWithToolApproval(),
        createToolModelMessageWithToolApproval(true),
      ],
    ]);
    expect(renderer.toolApprovalRequests).toEqual([
      expect.objectContaining({
        approvalId: "approval-1",
        toolCallId: "call-1",
        toolName: "shell",
        input: { command: "date" },
        messageId: "message-2",
        partIndex: 0,
      }),
    ]);
    expect(renderer.submittedPrompts).toEqual(["run command"]);
  });

  it("exits when prompt input is interrupted", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    useRenderer({
      async readPrompt() {
        throw new Error("Interrupted");
      },
      async renderStream() {
        throw new Error("Expected no stream to render.");
      },
    });
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expect(streamCalls).toEqual([]);
  });

  it("uses the provided name as the session title", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["hello", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expect(terminalRendererOptions).toEqual([undefined]);
    expect(renderer.submittedPrompts).toEqual(["hello"]);
    expect(renderer.titles).toEqual(["Test Agent", "Test Agent", "Test Agent"]);
  });

  it("defaults assistant response stats mode to tokens per second", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["hello", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expect(renderer.assistantResponseStats).toEqual(["tokensPerSecond"]);
  });

  it("passes assistant response stats mode to stream rendering", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["hello", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({
      agent,
      name: "Test Agent",
      assistantResponseStats: "tokens",
    }).run();

    expect(renderer.assistantResponseStats).toEqual(["tokens"]);
  });

  it("passes context size to stream rendering", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["hello", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({
      agent,
      name: "Test Agent",
      contextSize: 200_000,
    }).run();

    expect(renderer.contextSizes).toEqual([200_000]);
  });

  it("streams total token usage in response metadata", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["hello", undefined],
      }),
    );
    const agent = createAgent(streamCalls, [
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", text: "hello" },
      { type: "text-end", id: "text-1" },
      {
        type: "finish",
        finishReason: "stop",
        rawFinishReason: "stop",
        totalUsage: createUsage({ inputTokens: 3, outputTokens: 12, totalTokens: 15 }),
      },
    ]);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expect(renderer.responseMessages[0]?.metadata).toEqual({
      usage: { totalTokens: 15, outputTokens: 12 },
    });
  });

  it("accepts an injected renderer", async () => {
    const streamCalls: AgentTUIStreamCall[] = [];
    const renderer = createRenderer({
      prompts: ["hello", undefined],
    });
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent", renderer }).run();

    expectStreamCalls(streamCalls, [[createUserModelMessage("hello")]]);
    expect(terminalRendererOptions).toEqual([]);
    expect(renderer.submittedPrompts).toEqual(["hello"]);
  });
});

type AgentTUIStreamCall = AgentStreamParameters<never, any, any>;

function createAgent(
  streamCalls: AgentTUIStreamCall[],
  fullStreamParts?: TextStreamPart<ToolSet>[],
): AgentTUIAgent {
  return {
    version: "agent-v1",
    id: undefined,
    tools: {},
    generate() {
      throw new Error("Expected no generate call.");
    },
    stream(options: AgentTUIStreamCall) {
      streamCalls.push(options);

      return {
        fullStream: fullStreamParts ?? createStream(`response to ${lastUserMessageText(options)}`),
      } as any;
    },
  };
}

function createMultiStepAgent(streamCalls: AgentTUIStreamCall[]): AgentTUIAgent {
  return {
    version: "agent-v1",
    id: undefined,
    tools: {},
    generate() {
      throw new Error("Expected no generate call.");
    },
    stream(options: AgentTUIStreamCall) {
      streamCalls.push(options);

      return {
        fullStream: createMultiStepStream(),
      } as any;
    },
  };
}

function createApprovalAgent(streamCalls: AgentTUIStreamCall[]): AgentTUIAgent {
  return {
    version: "agent-v1",
    id: undefined,
    tools: {},
    generate() {
      throw new Error("Expected no generate call.");
    },
    stream(options: AgentTUIStreamCall) {
      streamCalls.push(options);

      return {
        fullStream:
          streamCalls.length === 1 ? createApprovalRequestStream() : createApprovalResponseStream(),
      } as any;
    },
  };
}

function createAISDKAgent(): Agent<any, any, any, any> {
  return { version: "agent-v1" } as Agent<any, any, any, any>;
}

type TestRenderer = AgentTUIRenderer & {
  submittedPrompts: string[];
  titles: string[];
  assistantResponseStats: Array<AgentTUISessionOptions["assistantResponseStats"]>;
  contextSizes: Array<AgentTUISessionOptions["contextSize"]>;
  toolApprovalRequests: AgentTUIToolApprovalRequest[];
  responseMessages: UIMessage[];
};

function useRenderer<TRenderer extends AgentTUIRenderer>(renderer: TRenderer): TRenderer {
  testRenderer = renderer;

  return renderer;
}

function expectStreamCalls(calls: AgentTUIStreamCall[], prompts: ModelMessage[][]) {
  expect(calls).toHaveLength(prompts.length);

  for (const [index, prompt] of prompts.entries()) {
    expect(calls[index]?.prompt).toEqual(prompt);
    expect(calls[index]?.abortSignal).toBeInstanceOf(AbortSignal);
  }
}

function createRenderer(options: {
  prompts: Array<string | undefined>;
  toolApprovals?: AgentTUIToolApprovalResponse[];
}): TestRenderer {
  const submittedPrompts: string[] = [];
  const titles: string[] = [];
  const assistantResponseStats: Array<AgentTUISessionOptions["assistantResponseStats"]> = [];
  const contextSizes: Array<AgentTUISessionOptions["contextSize"]> = [];
  const toolApprovalRequests: AgentTUIToolApprovalRequest[] = [];
  const responseMessages: UIMessage[] = [];

  return {
    submittedPrompts,
    titles,
    assistantResponseStats,
    contextSizes,
    toolApprovalRequests,
    responseMessages,
    async readPrompt(sessionOptions) {
      if (sessionOptions?.title) {
        titles.push(sessionOptions.title);
      }

      return options.prompts.shift();
    },
    async readToolApproval(request, sessionOptions) {
      if (sessionOptions?.title) {
        titles.push(sessionOptions.title);
      }

      toolApprovalRequests.push(request);

      const approval = options.toolApprovals?.shift();
      if (!approval) {
        throw new Error("Expected a test tool approval.");
      }

      return approval;
    },
    async renderStream(result, sessionOptions) {
      if (sessionOptions?.title) {
        titles.push(sessionOptions.title);
      }

      if (sessionOptions?.submittedPrompt) {
        submittedPrompts.push(sessionOptions.submittedPrompt);
      }

      assistantResponseStats.push(sessionOptions?.assistantResponseStats);
      contextSizes.push(sessionOptions?.contextSize);

      let responseMessage: UIMessage | undefined;

      for await (const message of readUIMessageStream({
        stream: toReadableStream(result.uiMessageStream),
      })) {
        responseMessage = message;
      }

      if (responseMessage) {
        responseMessages.push(responseMessage);
      }

      return responseMessage;
    },
  };
}

function createStream(text: string): AsyncIterable<TextStreamPart<ToolSet>> {
  return (async function* () {
    yield { type: "text-delta", id: "text-1", text };
  })();
}

function createUsage({
  inputTokens,
  outputTokens,
  totalTokens,
}: {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}) {
  return {
    inputTokens,
    inputTokenDetails: {
      noCacheTokens: inputTokens,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens,
    outputTokenDetails: {
      textTokens: outputTokens,
      reasoningTokens: undefined,
    },
    totalTokens,
  };
}

function lastUserMessageText(options: AgentTUIStreamCall) {
  const prompt = options.prompt as ModelMessage[];
  const message = prompt.findLast((message) => message.role === "user");

  if (!message) {
    throw new Error("Expected at least one user message.");
  }

  return modelMessageText(message);
}

function modelMessageText(message: ModelMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function createUserModelMessage(text: string): ModelMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
  };
}

function createAssistantModelMessage(text: string): ModelMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
  };
}

function createAssistantModelMessageWithToolInvocation(): ModelMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "weather",
        input: { city: "Berlin" },
        providerExecuted: undefined,
      },
      { type: "text", text: "Berlin is snowy and 72F." },
    ],
  };
}

function createToolModelMessageWithToolInvocation(): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "weather",
        output: {
          type: "json",
          value: { city: "Berlin", temperature: 72, weather: "snowy" },
        },
      },
    ],
  };
}

function createAssistantModelMessageWithToolApproval(): ModelMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "shell",
        input: { command: "date" },
        providerExecuted: undefined,
      },
      {
        type: "tool-approval-request",
        approvalId: "approval-1",
        toolCallId: "call-1",
        isAutomatic: undefined,
      },
    ],
  };
}

function createToolModelMessageWithToolApproval(approved: boolean): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-approval-response",
        approvalId: "approval-1",
        approved,
        reason: undefined,
        providerExecuted: undefined,
      },
    ],
  };
}

function toReadableStream(
  stream: AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  if (stream instanceof ReadableStream) {
    return stream;
  }

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createMultiStepStream(): AsyncIterable<TextStreamPart<ToolSet>> {
  return (async function* () {
    yield {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "weather",
      input: { city: "Berlin" },
    } as TextStreamPart<ToolSet>;
    yield {
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "weather",
      input: { city: "Berlin" },
      output: { city: "Berlin", temperature: 72, weather: "snowy" },
    } as TextStreamPart<ToolSet>;
    yield { type: "text-delta", id: "text-1", text: "Berlin is snowy and 72F." };
  })();
}

function createApprovalRequestStream(): AsyncIterable<TextStreamPart<ToolSet>> {
  return (async function* () {
    yield {
      type: "tool-approval-request",
      approvalId: "approval-1",
      toolCall: {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "shell",
        input: { command: "date" },
      },
    } as TextStreamPart<ToolSet>;
  })();
}

function createApprovalResponseStream(): AsyncIterable<TextStreamPart<ToolSet>> {
  return (async function* () {
    yield {
      type: "tool-approval-response",
      approvalId: "approval-1",
      toolCall: {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "shell",
        input: { command: "date" },
      },
      approved: true,
    } as TextStreamPart<ToolSet>;
    yield {
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "shell",
      input: { command: "date" },
      output: "ok",
    } as TextStreamPart<ToolSet>;
    yield { type: "text-delta", id: "text-1", text: "command approved" };
  })();
}
