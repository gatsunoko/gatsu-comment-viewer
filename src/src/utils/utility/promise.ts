
/**
 * 指定時間後に履行するプロミスを返す\
 * 渡された`signal`がabortすると`AbortError`が発生します
 * @param ms 待機するミリ秒
 * @param signal 時間が経過する前にキャンセルするためのシグナル
 */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal == null) return new Promise(resolve => setTimeout(resolve, ms));

  if (signal.aborted) {
    await sleep(0);
    return Promise.reject(createAbortError());
  }

  const { promise, resolve, reject } = promiser<void>();
  const id = setTimeout(timeout, ms);
  signal.addEventListener("abort", aborted);
  return promise;


  function timeout() {
    signal!.removeEventListener("abort", aborted);
    resolve();
  }

  function aborted() {
    clearTimeout(id);
    signal!.removeEventListener("abort", aborted);
    reject(createAbortError());
  }
}



type ResolveType<T> = [T] extends [void] ? () => void : (value: T) => void;

export interface Promiser<T = void> {
  promise: Promise<T>;
  resolve: ResolveType<T>;
  reject: (reason?: any) => void;
}

export function promiser<T = void>(): Promiser<T> {
  let resolve: ResolveType<T> = null!;
  let reject: (reason?: any) => void = null!;
  const promise = new Promise<T>(((res, rej) => [resolve, reject] = [res as ResolveType<T>, rej]));
  return { promise, resolve, reject };
}



/**
 * `AbortError`を安全にラップする\
 * それ以外のエラーはラップしない
 * @param promise 
 * @param signal Promiseの終了理由が`AbortError`か
 * @returns 
 */
export async function abortErrorWrap(promise: Promise<any>, signal: AbortSignal): Promise<boolean> {
  try {
    await promise;
  } catch (e) {
    if (isAbortError(e, signal)) return true;
  }
  return false;
}

/**
 * シグナルにイベントを登録するユーティリティ\
 * シグナルが既に拒否されていた場合は即座に`onAbort`を呼び出します
 */
export function signalConnector(
  signal: AbortSignal | null | undefined,
  onAbort: () => void
): () => void {
  if (signal == null) return () => { };
  if (signal.aborted) {
    onAbort();
    return () => { };
  }

  signal.addEventListener("abort", onAbort);

  return () => {
    signal.removeEventListener("abort", onAbort);
  };
}

export function createAbortError(): DOMException {
  return new DOMException("操作が中止されました", "AbortError");
}

export function isAbortError(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true && error instanceof Error && error.name === "AbortError";
}
