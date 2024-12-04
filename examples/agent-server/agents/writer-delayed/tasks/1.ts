import { StreamTask } from '@ai-sdk/agent-server';
import { StreamData } from 'ai';
import { Context } from '../agent';

// TODO special DataStreamTask
export default new StreamTask<Context, string>({
  async execute({ context, mergeStream }) {
    // immediately start streaming status information:
    const streamData = new StreamData();
    mergeStream(streamData.toAgentStream());
    streamData.append({ status: 'analyzing message' });
    streamData.close();

    console.log('task 1 done');

    return { nextTask: '2' };
  },
});
