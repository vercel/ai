import { task } from '@ai-sdk/agent-server';

export default task({
  async execute({ writeData }) {
    writeData({ status: 'analyzing message' });
    return { nextTask: '2' };
  },
});
