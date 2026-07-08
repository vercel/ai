import type { JsonRpcMessage, NdjsonTransport } from "./ndjson-rpc.js";
import { parseNdjsonLine } from "./ndjson-rpc.js";
import type { AcpBridgeChannel } from "./acp-bridge.js";

export class WsAcpRpcTransport implements NdjsonTransport {
  private readonly messageHandlers = new Set<(message: JsonRpcMessage) => void>();
  private offRpcLine: (() => void) | undefined;
  private onParentAbort: (() => void) | undefined;

  constructor(
    private readonly channel: AcpBridgeChannel,
    private readonly abortSignal?: AbortSignal,
  ) {}

  async connect(opts?: { resume?: boolean }): Promise<void> {
    if (this.abortSignal) {
      this.onParentAbort = () => {
        this.channel.beginClose();
        void this.channel.close();
      };
      this.abortSignal.addEventListener("abort", this.onParentAbort, { once: true });
    }

    this.offRpcLine = this.channel.on("rpc-line", (event) => {
      const message = parseNdjsonLine(event.line);
      if (!message) return;
      for (const handler of this.messageHandlers) {
        handler(message);
      }
    });

    await this.channel.open(opts?.resume ? { resume: true } : undefined);
  }

  onMessage(handler: (message: JsonRpcMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  async send(message: JsonRpcMessage): Promise<void> {
    this.channel.send({
      type: "rpc-send",
      line: JSON.stringify(message),
    });
  }

  async close(): Promise<void> {
    if (this.abortSignal && this.onParentAbort) {
      this.abortSignal.removeEventListener("abort", this.onParentAbort);
      this.onParentAbort = undefined;
    }
    this.offRpcLine?.();
    this.messageHandlers.clear();
    this.channel.beginClose();
    await this.channel.close();
  }
}