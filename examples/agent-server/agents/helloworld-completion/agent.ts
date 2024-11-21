import type { Agent } from '@ai-sdk/agent-server';

export default class HelloWorldAgent implements Agent {
  async init() {
    // log current node directory (for debugging purposes)
    console.log('Hello World!', process.cwd());
  }
}
