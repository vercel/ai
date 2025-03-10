import {
  withTestServer,
  describeWithTestServer,
} from "@ai-sdk/provider-utils/test";
import { StructuredObject } from "./structured-object.svelte.js";
import { render } from "@testing-library/svelte";
import { z } from "zod";
import StructuredObjectSynchronization from "./tests/structured-object-synchronization.svelte";

describe("text stream", () => {
  let structuredObject: StructuredObject<{ content: string }>;

  beforeEach(() => {
    structuredObject = new StructuredObject({
      api: "/api/object",
      schema: z.object({ content: z.string() }),
    });
  });

  describeWithTestServer(
    'when the API returns "Hello, world!"',
    {
      url: "api/object",
      type: "stream-values",
      content: ["{ ", '"content": "Hello, ', "world", '!"', " }"],
    },
    ({ call }) => {
      beforeEach(async () => {
        await structuredObject.submit("test-input");
      });

      it("should render the stream", () => {
        expect(structuredObject.object).toEqual({ content: "Hello, world!" });
      });

      it("should send the correct input to the API", async () => {
        expect(await call(0).getRequestBodyJson()).toBe("test-input");
      });

      it("should not have an error", () => {
        expect(structuredObject.error).toBeUndefined();
      });
    },
  );

  describe("loading", () => {
    it(
      "should be true while loading",
      withTestServer(
        { url: "/api/object", type: "controlled-stream" },
        async ({ streamController }) => {
          streamController.enqueue('{"content": ');

          const submitOperation = structuredObject.submit("test-input");

          await vi.waitFor(() => {
            expect(structuredObject.loading).toBe(true);
          });

          streamController.enqueue('"Hello, world!"}');
          streamController.close();
          await submitOperation;

          expect(structuredObject.loading).toBe(false);
        },
      ),
    );
  });

  describe("stop", () => {
    it(
      "should abort the stream and not consume any more data",
      withTestServer(
        { url: "/api/object", type: "controlled-stream" },
        async ({ streamController }) => {
          streamController.enqueue('{"content": "h');

          const submitOperation = structuredObject.submit("test-input");

          await vi.waitFor(() => {
            expect(structuredObject.loading).toBe(true);
            expect(structuredObject.object).toStrictEqual({
              content: "h",
            });
          });

          structuredObject.stop();

          await vi.waitFor(() => {
            expect(structuredObject.loading).toBe(false);
          });

          streamController.enqueue('ello, world!"}');
          streamController.close();
          await submitOperation;

          expect(structuredObject.loading).toBe(false);
          expect(structuredObject.object).toStrictEqual({
            content: "h",
          });
        },
      ),
    );
  });

  describe("when the API returns a 404", () => {
    it(
      "should produce the correct error state",
      withTestServer(
        {
          url: "/api/object",
          type: "error",
          status: 404,
          content: "Not found",
        },
        async () => {
          await structuredObject.submit("test-input");
          expect(structuredObject.error).toBeInstanceOf(Error);
          expect(structuredObject.error?.message).toBe("Not found");
          expect(structuredObject.loading).toBe(false);
        },
      ),
    );
  });

  describe("onFinish", () => {
    it(
      "should be called with an object when the stream finishes and the object matches the schema",
      withTestServer(
        {
          url: "/api/object",
          type: "stream-values",
          content: ["{ ", '"content": "Hello, ', "world", '!"', "}"],
        },
        async () => {
          const onFinish = vi.fn();
          const structuredObjectWithOnFinish = new StructuredObject({
            api: "/api/object",
            schema: z.object({ content: z.string() }),
            onFinish,
          });
          await structuredObjectWithOnFinish.submit("test-input");

          expect(onFinish).toHaveBeenCalledExactlyOnceWith({
            object: { content: "Hello, world!" },
            error: undefined,
          });
        },
      ),
    );

    it(
      "should be called with an error when the stream finishes and the object does not match the schema",
      withTestServer(
        {
          url: "/api/object",
          type: "stream-values",
          content: ["{ ", '"content-wrong": "Hello, ', "world", '!"', "}"],
        },
        async () => {
          const onFinish = vi.fn();
          const structuredObjectWithOnFinish = new StructuredObject({
            api: "/api/object",
            schema: z.object({ content: z.string() }),
            onFinish,
          });
          await structuredObjectWithOnFinish.submit("test-input");

          expect(onFinish).toHaveBeenCalledExactlyOnceWith({
            object: undefined,
            error: expect.any(Error),
          });
        },
      ),
    );
  });

  it(
    "should send custom headers",
    withTestServer(
      {
        url: "/api/object",
        type: "stream-values",
        content: ["{ ", '"content": "Hello, ', "world", '!"', "}"],
      },
      async ({ call }) => {
        const structuredObjectWithCustomHeaders = new StructuredObject({
          api: "/api/object",
          schema: z.object({ content: z.string() }),
          headers: {
            Authorization: "Bearer TEST_TOKEN",
            "X-Custom-Header": "CustomValue",
          },
        });

        await structuredObjectWithCustomHeaders.submit("test-input");

        expect(call(0).getRequestHeaders()).toStrictEqual({
          "content-type": "application/json",
          authorization: "Bearer TEST_TOKEN",
          "x-custom-header": "CustomValue",
        });
      },
    ),
  );
});

describe("synchronization", () => {
  it(
    "correctly synchronizes content between hook instances",
    withTestServer(
      {
        type: "stream-values",
        url: "/api/object",
        content: ["{ ", '"content": "Hello, ', "world", '!"', "}"],
      },
      async () => {
        const {
          component: { object1, object2 },
        } = render(StructuredObjectSynchronization, {
          id: crypto.randomUUID(),
          api: "/api/object",
          schema: z.object({ content: z.string() }),
        });

        await object1.submit("hi");

        expect(object1.object).toStrictEqual({ content: "Hello, world!" });
        expect(object2.object).toStrictEqual(object1.object);
      },
    ),
  );

  it(
    "correctly synchronizes loading and error state between hook instances",
    withTestServer(
      {
        type: "controlled-stream",
        url: "/api/object",
      },
      async ({ streamController }) => {
        const {
          component: { object1, object2 },
        } = render(StructuredObjectSynchronization, {
          id: crypto.randomUUID(),
          api: "/api/object",
          schema: z.object({ content: z.string() }),
        });

        const submitOperation = object1.submit("hi");

        await vi.waitFor(() => {
          expect(object1.loading).toBe(true);
          expect(object2.loading).toBe(true);
        });

        streamController.enqueue('{ "content": "Hello"');
        await vi.waitFor(() => {
          expect(object1.object).toStrictEqual({ content: "Hello" });
          expect(object2.object).toStrictEqual(object1.object);
        });

        streamController.error(new Error("Failed to be cool enough"));
        await submitOperation;

        expect(object1.loading).toBe(false);
        expect(object2.loading).toBe(false);
        expect(object1.error).toBeInstanceOf(Error);
        expect(object1.error?.message).toBe("Failed to be cool enough");
        expect(object2.error).toBeInstanceOf(Error);
        expect(object2.error?.message).toBe("Failed to be cool enough");
      },
    ),
  );
});
