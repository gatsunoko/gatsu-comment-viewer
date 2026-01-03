/**
 * 非同期イテレータとそれを制御する関数のセット
 * 
 * イテレータを読むのは同時に１つのみで、複数の読み出しは禁止です
 */
export interface AsyncIteratorSet<T> {
  /**
   * 同時に複数の読み出しは想定されていません
   * - BAD: `iterator.next()`を同期的に２回実行する
   * - BAD: `for await`を２つ同時に実行する
   * @example
   * // BAD: for await は同時に１つのみ
   * async function read<T>(iter: AsyncIterableIterator<T>) {
   *   for await (const value of iter) ...
   * }
   * 
   * read(iterator);
   * read(iterator);  // 同時に２つの for await は禁止です
   * 
   * // BAD: next(); の呼び出しは必ず同時に１つのみ
   * const p1 = iterator.next();
   * const p2 = iterator.next();
   * 
   * // GOOD: await で待機して１つずつ読み出す
   * const r1 = await iterator.next();
   * const r2 = await iterator.next();
   */
  readonly iterator: AsyncIterableIterator<T>;
  /**
   * イテレータの末尾に値を追加します\
   * イテレータが終了している場合は何もしません
   */
  enqueue(value: T): void;
  /**
   * イテレータの末尾にエラーを渡し、イテレータを終了します\
   * イテレータが終了している場合は何もしません
   */
  fail(reason?: unknown): void;
  /**
   * イテレータを終了します\
   * イテレータが終了している場合は何もしません
   */
  close(): void;
}

export type AsyncIteratorFilter<T = never> = (value: T) => (
  | boolean
  | readonly [keep: boolean, nextFilter: AsyncIteratorFilter<T> | undefined]);

export interface AsyncIteratorSetOption<T> {
  /**
   * `enqueue`時に値を取り除くフィルター関数\
   * `true`の場合に値を保持します
   * @param value フィルターする値
   * @returns `true`の場合に値を保持します\
   * タプルの場合は１つ目が保持するかどうか、２つ目が次から使用される新しいフィルターです
   */
  readonly filter?: AsyncIteratorFilter<T>;
  /**
   * イテレータが`break;`したら実行する関数
   */
  readonly breaked?: () => void;
}

export const AsyncIteratorSet = {
  /**
   * 外部から値をキューに追加出来る非同期イテレータ
   * @param option {@link AsyncIteratorSetOption}
   */
  create: <T>(option?: AsyncIteratorSetOption<T>): AsyncIteratorSet<T> => {
    type STATE = "iterating" | "closed" | "failed";

    let resolveNext: ((v: IteratorResult<T>) => void) | undefined;
    let rejectNext: ((e: unknown) => void) | undefined;
    let state: STATE = "iterating";
    let error: unknown;
    const queue: T[] = [];
    let filter = option?.filter;

    const iterable: AsyncIterableIterator<T> = {
      next(): Promise<IteratorResult<T>> {
        // close されていても、残キューは配信する
        if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false });
        switch (state) {
          case "iterating": return nextPromise();
          case "closed": return Promise.resolve({ value: undefined as T, done: true });
          case "failed": return Promise.reject(error);
        }
      },
      [Symbol.asyncIterator]() { return iterable; },
      return() {
        if (state === "iterating") {
          option?.breaked?.();
          doClose();
        }
        return Promise.resolve({ value: undefined as T, done: true });
      },
    };

    return { iterator: iterable, enqueue, fail: doFail, close: doClose };

    function nextPromise() {
      return new Promise<IteratorResult<T>>((resolve, reject) => {
        resolveNext = resolve;
        rejectNext = reject;
      });
    }

    function enqueue(value: T): void {
      if (state !== "iterating") return;
      if (filter != null) {
        let res = filter(value);
        if (res === false) return;
        if (res !== true) {
          [res, filter] = res;
          if (!res) return;
        }
      }

      if (resolveNext != null) {
        resolveNext({ value, done: false });
        cleanupWaiters();
      } else {
        queue.push(value);
      }
    }

    function doFail(reason?: unknown) {
      if (state !== "iterating") return;
      state = "failed";
      error = reason;

      if (rejectNext != null) {
        rejectNext(error);
        cleanupWaiters();
      }
    }

    function doClose() {
      if (state !== "iterating") return;
      state = "closed";

      if (resolveNext != null) {
        if (queue.length === 0) {
          resolveNext({ value: undefined, done: true });
        } else {
          resolveNext({ value: queue.shift()!, done: false });
        }
        cleanupWaiters();
      }
    }

    function cleanupWaiters() {
      resolveNext = undefined;
      rejectNext = undefined;
    }
  },
} as const;
