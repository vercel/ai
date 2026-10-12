// @ts-nocheck
import { convertToModelMessages } from 'ai';

function prepare(messages: any[]) {
  return convertToModelMessages(messages);
}

const prepareArrow = (messages: any[]) => convertToModelMessages(messages);

const handlers = {
  prepare(messages: any[]) {
    const result = convertToModelMessages(messages);
    return result;
  },
};

class MessageHandler {
  constructor(messages: any[]) {
    this.messages = convertToModelMessages(messages);
  }

  prepare(messages: any[]) {
    const result = convertToModelMessages(messages);
    return result;
  }
}

async function alreadyAsync(messages: any[]) {
  return convertToModelMessages(messages);
}

const topLevelMessages = convertToModelMessages([]);
