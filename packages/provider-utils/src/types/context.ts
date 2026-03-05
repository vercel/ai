export interface ContextRegistry {} // open via declaration merging

export type Context<T extends Partial<ContextRegistry> = ContextRegistry> = {
  [K in keyof T]: T[K];
};
