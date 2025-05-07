/**
 * Delayed promise. It is only constructed once the value is accessed.
 * This is useful to avoid unhandled promise rejections when the promise is created
 * but not accessed.
 */
export class DelayedPromise<T> {
  private status:
    | { type: 'pending' }
    | { type: 'resolved'; value: T }
    | { type: 'rejected'; error: unknown } = { type: 'pending' };
  private promise: Promise<T> | undefined;
  private _resolve: undefined | ((value: T) => void) = undefined;
  private _reject: undefined | ((error: unknown) => void) = undefined;

  get value(): Promise<T> {
    if (this.promise) {
      return this.promise;
    }

    this.promise = new Promise<T>((resolve, reject) => {
      if (this.status.type === 'resolved') {
        resolve(this.status.value);
      } else if (this.status.type === 'rejected') {
        reject(this.status.error);
      }

      this._resolve = resolve;
      this._reject = reject;
    });

    return this.promise;
  }

  resolve(value: T): void {
    this.status = { type: 'resolved', value };

    if (this.promise) {
      this._resolve?.(value);
    }
  }

  reject(error: unknown): void {
    this.status = { type: 'rejected', error };

    if (this.promise) {
      this._reject?.(error);
    }
  }
}
