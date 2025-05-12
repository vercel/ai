type JOB = () => Promise<void>;

let queue: Array<JOB> = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing || queue.length === 0) {
    return;
  }

  isProcessing = true;

  while (queue.length > 0) {
    const worker = queue[0];
    try {
      await worker();
    } catch (error) {
      console.error('Worker error:', error);
    }
    queue.shift(); // Remove the completed worker
  }

  isProcessing = false;
}

async function acquire(job: JOB): Promise<void> {
  return new Promise(resolve => {
    const wrappedWorker = async () => {
      resolve(); // Resolve when this worker starts
      await job();
    };

    queue.push(wrappedWorker);
    processQueue(); // Start processing if not already running
  });
}
