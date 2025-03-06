import { formatAssistantStreamPart } from "@ai-sdk/ui-utils";
import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
  mockFetchError,
} from "@ai-sdk/ui-utils/test";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Assistant } from "./assistant.svelte.js";
import { promiseWithResolvers } from "./utils.svelte.js";

describe("Assistant", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("stream data", () => {
    it("should show streamed response", async () => {
      const assistant = new Assistant({ api: "/api/assistant" });
      const { requestBody } = mockFetchDataStream({
        url: "https://example.com/api/assistant",
        chunks: [
          formatAssistantStreamPart("assistant_control_data", {
            threadId: "t0",
            messageId: "m0",
          }),
          formatAssistantStreamPart("assistant_message", {
            id: "m0",
            role: "assistant",
            content: [{ type: "text", text: { value: "" } }],
          }),
          '0:"Hello"\n',
          '0:","\n',
          '0:" world"\n',
          '0:"."\n',
        ],
      });

      await assistant.append({ role: "user", content: "hi" });

      expect(assistant.messages.at(0)).toStrictEqual({
        role: "user",
        content: "hi",
        id: expect.stringMatching(/\S+/),
      });
      expect(assistant.messages.at(1)).toStrictEqual({
        role: "assistant",
        id: "m0",
        content: "Hello, world.",
        parts: [],
      });

      // check that correct information was sent to the server:
      expect(await requestBody).toStrictEqual(
        JSON.stringify({
          threadId: null,
          message: "hi",
        }),
      );
    });

    it("should show error response", async () => {
      const assistant = new Assistant({ api: "/api/assistant" });
      mockFetchError({ statusCode: 500, errorMessage: "Internal Error" });

      await assistant.append({ role: "user", content: "hi" });

      expect(assistant.error).toBeInstanceOf(Error);
      expect(assistant.error?.message).toBe("Internal Error");
    });

    it("should show loading state", async () => {
      const assistant = new Assistant({ api: "/api/assistant" });
      let { promise: finishGenerationPromise, resolve: finishGeneration } =
        promiseWithResolvers<void>();

      mockFetchDataStreamWithGenerator({
        url: "https://example.com/api/chat",
        chunkGenerator: (async function* generate() {
          const encoder = new TextEncoder();

          yield encoder.encode(
            formatAssistantStreamPart("assistant_control_data", {
              threadId: "t0",
              messageId: "m1",
            }),
          );

          yield encoder.encode(
            formatAssistantStreamPart("assistant_message", {
              id: "m1",
              role: "assistant",
              content: [{ type: "text", text: { value: "" } }],
            }),
          );

          yield encoder.encode('0:"Hello"\n');

          await finishGenerationPromise;
        })(),
      });

      const appendOperation = assistant.append({
        role: "user",
        content: "hi",
      });
      expect(assistant.status).toBe("in_progress");

      finishGeneration();
      await appendOperation;

      expect(assistant.status).toBe("awaiting_message");
    });
  });
});
