type Job = () => Promise<void>;

export class SerialJobExecutor {
  queue: Array<Job>;
  isProcessing: boolean;

  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const worker = this.queue[0];

      try {
        await worker();
      } catch (error) {
        console.error('Error processing job:', error);
      }

      this.queue.shift();
    }

    this.isProcessing = false;
  }

  async run(job: Job): Promise<void> {
    return new Promise(resolve => {
      const wrappedWorker = async () => {
        resolve();
        await job();
      };

      this.queue.push(wrappedWorker);
      this.processQueue();
    });
  }
}
