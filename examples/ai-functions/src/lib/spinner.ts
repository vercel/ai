/**
 * A simple terminal spinner for long-running operations.
 * Uses built-in Node.js functionality - no external dependencies needed.
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;
  private stream = process.stderr;

  constructor(message: string = 'Loading...') {
    this.message = message;
  }

  start(): this {
    if (this.interval) return this;

    // Hide cursor
    this.stream.write('\x1B[?25l');

    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      this.stream.write(`\r${frame} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);

    return this;
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Clear the line and show cursor
    this.stream.write('\r\x1B[K');
    this.stream.write('\x1B[?25h');

    if (finalMessage) {
      this.stream.write(`${finalMessage}\n`);
    }
  }

  succeed(message?: string): void {
    this.stop(`✔ ${message || this.message}`);
  }

  fail(message?: string): void {
    this.stop(`✖ ${message || this.message}`);
  }

  update(message: string): void {
    this.message = message;
  }
}

/**
 * Wraps an async operation with a spinner.
 * @param message - The message to display while the operation is running.
 * @param fn - The async function to execute.
 * @returns The result of the async function.
 */
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = new Spinner(message);
  spinner.start();

  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}
