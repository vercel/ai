import { SvelteMap } from "svelte/reactivity";
import { box } from "./utils.svelte.js";

export type SharedKeyedStoreOptions<T> = Readonly<{
  id: string;
  store: SvelteMap<string, T>;
  initialValue: T | undefined;
  defaultValue: T;
}>;

export class SharedKeyedStore<T> {
  #options = $state<SharedKeyedStoreOptions<T>>()!;

  #id = $derived(box(this.#options.id));
  get id() {
    return this.#id.value;
  }
  set id(id: string) {
    this.#id.value = id;
  }

  get value(): T {
    return this.#options.store.get(this.id) ?? this.#options.defaultValue;
  }

  set value(value: T) {
    this.#options.store.set(this.id, value);
  }

  constructor(options: SharedKeyedStoreOptions<T>) {
    this.#options = options;
    this.value = options.initialValue ?? options.defaultValue;
  }
}
