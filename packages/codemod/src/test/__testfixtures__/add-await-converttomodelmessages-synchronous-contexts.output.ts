// @ts-nocheck
import { convertToModelMessages } from 'ai';

async function prepare(messages: any[]) {
  return await convertToModelMessages(messages);
}

const prepareArrow = async (messages: any[]) => await convertToModelMessages(messages);

const handlers = {
  async prepare(messages: any[]) {
    const result = await convertToModelMessages(messages);
    return result;
  },
};

class MessageHandler {
  constructor(messages: any[]) {
    this.messages = convertToModelMessages(messages);
  }

  async prepare(messages: any[]) {
    const result = await convertToModelMessages(messages);
    return result;
  }
}

async function alreadyAsync(messages: any[]) {
  return await convertToModelMessages(messages);
}

const topLevelMessages = await convertToModelMessages([]);
