import type { Job } from './job';

export class SerialJobExecutor {
  private queue: Array<Job> = [];
  private isProcessing = false;
  private isInvokingJob = false;
  private idleWaiters: Array<() => void> = [];

  private async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        let jobPromise: Promise<void>;

        this.isInvokingJob = true;
        try {
          jobPromise = this.queue[0]();
        } finally {
          this.isInvokingJob = false;
        }

        await jobPromise;
        this.queue.shift();
      }
    } finally {
      this.isProcessing = false;

      for (const resolve of this.idleWaiters.splice(0)) {
        resolve();
      }
    }
  }

  async run(job: Job): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await job();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      void this.processQueue();
    });
  }

  async waitForIdle(): Promise<void> {
    if (!this.isProcessing && this.queue.length === 0) {
      return;
    }

    await new Promise<void>(resolve => {
      this.idleWaiters.push(resolve);
    });
  }

  isExecutingJobSynchronously(): boolean {
    return this.isInvokingJob;
  }
}
