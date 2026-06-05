import { runAgentTUI } from "@lgrammel/agent-tui";
import { MockLanguageModelV4 } from "ai/test";
import { ToolLoopAgent, tool } from "ai";
import { assertType, describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { AgentTUIAgent } from "./run-agent-tui";

const model = new MockLanguageModelV4({
  doStream: async () => ({
    stream: new ReadableStream(),
  }),
});

describe("runAgentTUI types", () => {
  it("accepts a ToolLoopAgent without tools", () => {
    const agent = new ToolLoopAgent({
      model,
    });

    expectTypeOf(agent).toMatchTypeOf<AgentTUIAgent>();
    expectTypeOf(runAgentTUI({ name: "Unconfigured Agent", agent })).toEqualTypeOf<Promise<void>>();
    assertType<Promise<void>>(runAgentTUI({ name: "Unconfigured Agent", agent }));
  });

  it("accepts a ToolLoopAgent with tools", () => {
    const agent = new ToolLoopAgent({
      model,
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ city, temperature: 72 }),
        }),
      },
    });

    expectTypeOf(agent).toMatchTypeOf<AgentTUIAgent>();
    expectTypeOf(runAgentTUI({ name: "Tool Agent", agent })).toEqualTypeOf<Promise<void>>();
  });

  it("accepts a ToolLoopAgent with runtime context", () => {
    const agent = new ToolLoopAgent<never, {}, { userId: string }>({
      model,
      runtimeContext: { userId: "test-user" },
    });

    expectTypeOf(agent).toMatchTypeOf<AgentTUIAgent>();
    expectTypeOf(runAgentTUI({ name: "Runtime Context Agent", agent })).toEqualTypeOf<
      Promise<void>
    >();
  });

  it("accepts a context size option", () => {
    const agent = new ToolLoopAgent({
      model,
    });

    expectTypeOf(runAgentTUI({ name: "Context Agent", agent, contextSize: 200_000 })).toEqualTypeOf<
      Promise<void>
    >();
  });

  it("accepts a ToolLoopAgent with terminal display options", () => {
    expectTypeOf(
      runAgentTUI({
        name: "Demo Agent",
        agent: new ToolLoopAgent({
          model,
          instructions:
            "You are a concise terminal assistant. Answer in markdown and ask a brief clarifying question when the request is ambiguous.",
        }),
        tools: "collapsed",
        reasoning: "collapsed",
        assistantResponseStats: "tokensPerSecond",
      }),
    ).toEqualTypeOf<Promise<void>>();
  });

  it("rejects a ToolLoopAgent with optional call options", () => {
    const agent = new ToolLoopAgent<{ temperature?: number }>({
      model,
      callOptionsSchema: z.object({ temperature: z.number().optional() }),
    });

    expectTypeOf(agent).not.toMatchTypeOf<AgentTUIAgent>();

    runAgentTUI({
      name: "Optional Call Options Agent",
      // @ts-expect-error runAgentTUI cannot provide per-call options.
      agent,
    });
  });

  it("rejects a ToolLoopAgent with required call options", () => {
    const agent = new ToolLoopAgent<{ sessionId: string }>({
      model,
      callOptionsSchema: z.object({ sessionId: z.string() }),
    });

    expectTypeOf(agent).not.toMatchTypeOf<AgentTUIAgent>();

    runAgentTUI({
      name: "Required Call Options Agent",
      // @ts-expect-error runAgentTUI cannot provide required per-call options.
      agent,
    });
  });
});
