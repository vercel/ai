// @ts-nocheck
import { generateId as nanoid, generateId as createId, generateId } from 'ai';

const id = nanoid();
const aliasedId = createId();
const currentId = generateId();
const callbacks = [nanoid, createId];
const options = { nanoid, createId, generateId: nanoid };

function shadowed(nanoid: () => string) {
  return { id: nanoid(), generateId: nanoid };
}

function withExistingName(generateId: () => string) {
  return [nanoid(), generateId()];
}

export { nanoid, createId };
