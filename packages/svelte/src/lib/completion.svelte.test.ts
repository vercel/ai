import { withTestServer } from "@ai-sdk/provider-utils/test";
import { Completion } from "./completion.svelte.js";

describe("Completion", () => {
  it(
    "should render a data stream",
    withTestServer(
      {
        type: "stream-values",
        url: "/api/completion",
        content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      },
      async () => {
        const completion = new Completion();
        await completion.complete("hi");
        expect(completion.completion).toBe("Hello, world.");
      },
    ),
  );

  it(
    "should render a text stream",
    withTestServer(
      {
        type: "stream-values",
        url: "/api/completion",
        content: ["Hello", ",", " world", "."],
      },
      async () => {
        const completion = new Completion({ streamProtocol: "text" });
        await completion.complete("hi");
        expect(completion.completion).toBe("Hello, world.");
      },
    ),
  );

  it(
    "should call `onFinish` callback",
    withTestServer(
      {
        type: "stream-values",
        url: "/api/completion",
        content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      },
      async () => {
        const onFinish = vi.fn();
        const completion = new Completion({ onFinish });
        await completion.complete("hi");
        expect(onFinish).toHaveBeenCalledExactlyOnceWith("hi", "Hello, world.");
      },
    ),
  );

  it(
    "should show loading state",
    withTestServer(
      { url: "/api/chat", type: "controlled-stream" },
      async ({ streamController }) => {
        const completion = new Completion();
        const completionOperation = completion.complete("hi");
        streamController.enqueue('0:"Hello"\n');
        await vi.waitFor(() => expect(completion.loading).toBe(true));
        streamController.close();
        await completionOperation;
        expect(completion.loading).toBe(false);
      },
    ),
  );

  it(
    "should reset loading state on error",
    withTestServer(
      {
        type: "error",
        url: "/api/completion",
        status: 404,
        content: "Not found",
      },
      async () => {
        const completion = new Completion();
        await completion.complete("hi");
        expect(completion.error).toBeInstanceOf(Error);
        expect(completion.loading).toBe(false);
      },
    ),
  );

  it(
    "should reset error state on subsequent completion",
    withTestServer(
      [
        {
          type: "error",
          url: "/api/completion",
          status: 404,
          content: "Not found",
        },
        {
          type: "stream-values",
          url: "/api/completion",
          content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
        },
      ],
      async () => {
        const completion = new Completion();
        await completion.complete("hi");
        expect(completion.error).toBeInstanceOf(Error);
        expect(completion.loading).toBe(false);
        await completion.complete("hi");
        expect(completion.error).toBe(undefined);
        expect(completion.completion).toBe("Hello, world.");
      },
    ),
  );
});
