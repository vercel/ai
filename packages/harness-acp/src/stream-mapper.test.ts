import { describe, expect, it } from "vitest";

import {
  closeTextStream,
  createAcpStreamMapperState,
  finishStream,
  mapSessionUpdate,
} from "./stream-mapper.js";

describe("mapSessionUpdate", () => {
  it("maps agent_message_chunk to text stream parts", () => {
    const state = createAcpStreamMapperState();
    const parts = mapSessionUpdate(state, {
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { text: "Hello" },
      },
    });

    expect(parts).toEqual([
      { type: "text-start", id: "assistant-text" },
      { type: "text-delta", id: "assistant-text", delta: "Hello" },
    ]);
    expect(state.textOpen).toBe(true);
  });

  it("maps tool_call updates", () => {
    const state = createAcpStreamMapperState();
    const parts = mapSessionUpdate(state, {
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        toolName: "bash",
        input: { command: "ls" },
      },
    });

    expect(parts).toEqual([
      {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "bash",
        input: JSON.stringify({ command: "ls" }),
      },
    ]);
  });
});

describe("closeTextStream", () => {
  it("emits text-end when stream was open", () => {
    const state = createAcpStreamMapperState();
    state.textOpen = true;
    expect(closeTextStream(state)).toEqual([{ type: "text-end", id: "assistant-text" }]);
    expect(state.textOpen).toBe(false);
  });
});

describe("finishStream", () => {
  it("returns a finish part", () => {
    expect(finishStream()[0]?.type).toBe("finish");
  });
});