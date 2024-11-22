export type Worker<JOB> = (job: JOB) => PromiseLike<void>;

export class JobQueue<JOB> {
  private queue: JOB[] = [];
  private resolvers: ((job: JOB) => void)[] = [];

  async push(job: JOB): Promise<void> {
    if (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()!;
      resolver(job);
    } else {
      this.queue.push(job);
    }
  }

  private async waitForJob(): Promise<JOB> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }

    return new Promise(resolve => {
      this.resolvers.push(resolve);
    });
  }

  async startWorker(processJob: Worker<JOB>): Promise<void> {
    while (true) {
      const job = await this.waitForJob();
      await processJob(job);
    }
  }
}
