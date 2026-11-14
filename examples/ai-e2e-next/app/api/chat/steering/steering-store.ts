import { experimental_createSteering, type Experimental_Steering } from 'ai';

// Use globalThis so that the chat route and the steer route share the map,
// also when Next.js reloads modules in development:
declare global {
  var steeringByChatId: Map<string, Experimental_Steering> | undefined;
}

const steeringByChatId = (globalThis.steeringByChatId ??= new Map());

export function startSteering(chatId: string): Experimental_Steering {
  const steering = experimental_createSteering();
  steeringByChatId.set(chatId, steering);
  return steering;
}

export function endSteering(chatId: string, steering: Experimental_Steering) {
  if (steeringByChatId.get(chatId) === steering) {
    steeringByChatId.delete(chatId);
  }
}

export function getSteering(chatId: string): Experimental_Steering | undefined {
  return steeringByChatId.get(chatId);
}
