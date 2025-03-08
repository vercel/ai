import { describe, it, expect } from "vitest";
import {
  MessageManagerStore,
  ThreadMessageManager,
} from "./thread-message-manager.svelte.js";

describe("ThreadMessageManager", () => {
  it("should create a new thread", () => {
    const manager = new ThreadMessageManager();
    expect(manager.threadId).toBeUndefined();
  });

  it("should set a new thread ID", () => {
    const manager = new ThreadMessageManager();
    manager.threadId = "t1";
    expect(manager.threadId).toBe("t1");
  });

  it("should set messages on a new thread", () => {
    const manager = new ThreadMessageManager();
    manager.threadId = "t1";
    manager.messages = [{ id: "m0", role: "user", content: "hi" }];
    expect(manager.messages).toStrictEqual([
      { id: "m0", role: "user", content: "hi" },
    ]);
  });

  it("should retain message state when switching threads", () => {
    const manager = new ThreadMessageManager();
    manager.threadId = "t1";
    manager.messages = [{ id: "m0", role: "user", content: "hi" }];
    manager.threadId = "t2";
    manager.messages = [{ id: "m0", role: "user", content: "hello" }];
    expect(manager.messages).toStrictEqual([
      { id: "m0", role: "user", content: "hello" },
    ]);
    manager.threadId = "t1";
    expect(manager.messages).toStrictEqual([
      { id: "m0", role: "user", content: "hi" },
    ]);
  });

  it("should hold unaffiliated messages until a thread ID is assigned", () => {
    const manager = new ThreadMessageManager();
    manager.messages = [{ id: "m0", role: "user", content: "hi" }];
    expect(manager.threadId).toBeUndefined();
    expect(manager.messages).toStrictEqual([
      { id: "m0", role: "user", content: "hi" },
    ]);
    manager.threadId = "t1";
    expect(manager.messages).toStrictEqual([
      { id: "m0", role: "user", content: "hi" },
    ]);

    manager.threadId = undefined;
    expect(manager.messages).toStrictEqual([]);
    manager.messages.push({ id: "m1", role: "user", content: "hello" });
    expect(manager.messages).toStrictEqual([
      { id: "m1", role: "user", content: "hello" },
    ]);
    manager.threadId = "t2";
    expect(manager.messages).toStrictEqual([
      { id: "m1", role: "user", content: "hello" },
    ]);
    manager.threadId = "t1";
    expect(manager.messages).toStrictEqual([
      { id: "m0", role: "user", content: "hi" },
    ]);
  });

  describe("shared state", () => {
    it("should keep instances with shared stores in sync", () => {
      const store = new MessageManagerStore();
      const manager1 = new ThreadMessageManager({ store });
      const manager2 = new ThreadMessageManager({ store });
      manager1.threadId = "t1";
      manager1.messages = [{ id: "m0", role: "user", content: "hi" }];

      manager2.threadId = "t1";
      expect(manager2.messages).toStrictEqual([
        { id: "m0", role: "user", content: "hi" },
      ]);
    });

    it("should not clobber messages with subsequent changes from undefined to defined thread IDs", () => {
      const store = new MessageManagerStore();
      const manager1 = new ThreadMessageManager({ store });
      const manager2 = new ThreadMessageManager({ store });
      manager1.threadId = "t1";
      manager1.messages = [{ id: "m0", role: "user", content: "hi" }];

      // This one has messages assigned with an undefined thread ID; it should not clobber the messages
      // when the thread ID is assigned.
      manager2.messages = [{ id: "m1", role: "user", content: "hello" }];
      manager2.threadId = "t1";

      expect(manager1.messages).toStrictEqual([
        { id: "m0", role: "user", content: "hi" },
      ]);
      expect(manager2.messages).toStrictEqual([
        { id: "m0", role: "user", content: "hi" },
      ]);
    });
  });
});
