/** Cancellation and settlement belong to one connection attempt. */
export class RealtimeAttempt {
  readonly abort = new AbortController();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private settleClose?: () => void;
  closePromise?: Promise<void>;
  active = true;
  ready = false;
  closing = false;
  transportClosing = false;
  cause?: Error;

  timer(name: string, duration: number, callback: () => void): void {
    this.clearTimer(name);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        if (this.active) callback();
      }, duration),
    );
  }

  clearTimer(name: string): void {
    clearTimeout(this.timers.get(name));
    this.timers.delete(name);
  }

  beginClose(): Promise<void> {
    this.closing = true;
    return (this.closePromise ??= new Promise(resolve => {
      this.settleClose = resolve;
    }));
  }

  retire(): void {
    if (!this.active) return;
    this.active = false;
    this.abort.abort();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.settleClose?.();
    this.settleClose = undefined;
  }
}
