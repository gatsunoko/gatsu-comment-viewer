import { AsyncIteratorSet, createAbortError, promiser, signalConnector } from "../utils";
import { protobuf } from "../_protobuf";
import { readStream } from "./protobuf";

/**
 * ウェブソケットに接続し、受信したメッセージはイテレータに流します\
 * WebSocket が接続されると値が返ります
 *
 * 切断されるとイテレータは終了します
 * @param url 接続先のURL
 * @param receiver 受信したデータを加工してストリームに追加します
 * @param onClose 接続終了時に呼び出されます
 * @param signal 接続確立前にキャンセルするためのシグナル
 * @returns WebSocket のメッセージを受け取るイテレーターセット
 */
export async function connectWsAndAsyncIterable<
  WsMessage,
  Data = MessageEvent<WsMessage>,
>(
  url: string,
  { receiver, onClose, signal }: {
    receiver?: (e: MessageEvent<WsMessage>) => Data,
    onClose?: () => void,
    signal?: AbortSignal,
  }
): Promise<readonly [WebSocket, AsyncIteratorSet<Data>]> {
  const ws = new WebSocket(url);
  const iteratorSet = AsyncIteratorSet.create<Data>({ breaked: () => ws.close() });
  const onMessage: (e: MessageEvent<WsMessage>) => void
    = receiver == null
      ? e => iteratorSet.enqueue(e as Data)
      : e => iteratorSet.enqueue(receiver(e));

  const openPromiser = promiser();
  ws.addEventListener("open", openPromiser.resolve);
  ws.addEventListener("message", onMessage);
  ws.addEventListener("close", cleanUp);
  ws.addEventListener("error", cleanUp);

  const cleanup = signalConnector(signal, () => {
    openPromiser.reject(createAbortError());
    ws.close();
  });

  await openPromiser.promise;
  cleanup();
  ws.removeEventListener("open", openPromiser.resolve);

  return [ws, iteratorSet];


  function cleanUp(event: Event | CloseEvent) {
    ws.removeEventListener("message", onMessage);
    ws.removeEventListener("close", cleanUp);
    ws.removeEventListener("error", cleanUp);
    openPromiser.reject(event);
    onClose?.();
    iteratorSet.close();
  }
}

/**
 * ストリームの非同期イテレータ
 * @extends
 * ```typescript
 * const res = await fetchStreaming("URI", dwango.ChunkedEntrySchema)
 * for await (const data of res.iterator) {
 *   // data is dwango.ChunkedEntry
 * }
 * // STOPED
 * res.controller.signal.aborted // check aborted
 * ```
 */
export interface ResponseIteratorSet<Desc extends protobuf.DescMessage> {
  /**
   * フェッチのレスポンス
   */
  readonly response: Response;
  /**
   * 内容を取得するイテレータ
   */
  readonly iterator: AsyncIterableIterator<protobuf.MessageShape<Desc>>;
  /**
   * 終了したら履行してエラーが発生したら拒否されるプロミス
   */
  readonly closed: Promise<void>;
}

export const ResponseIteratorSet = {
  /**
   * フェッチしたストリームを非同期イテレータにして返します
   * @param uri 接続先
   * @param desc 受信するメッセージのprotobuf宣言
   * @param signal {@link AbortSignal}
   * @returns `AbortableStreamingData<protobuf.DescMessage>`
   * @extends
   * ```typescript
   * const res = await fetchStreaming("URI", dwango.ChunkedEntrySchema)
   * for await (const data of res.iterator) {
   *   // data is dwango.ChunkedEntry
   * }
   * // STOPED
   * res.controller.signal.aborted // check aborted
   * ```
   */
  fetch: async<Desc extends protobuf.DescMessage>(
    uri: string,
    desc: Desc,
    signal?: AbortSignal,
  ): Promise<ResponseIteratorSet<Desc>> => {
    const res = await fetch(uri, { signal });
    if (res.body == null) throw new Error(`fetchで問題が発生しました\nuri:${uri} status:${res.status}`);
    const reader = res.body.getReader();
    const iterator = readStream(reader, desc);

    signal?.addEventListener("abort", onAbort);

    return { response: res, iterator, closed: reader.closed };


    function onAbort() {
      signal?.removeEventListener("abort", onAbort);
      reader.cancel();
      iterator.throw(new DOMException("Aborted", "AbortError"));
    }
  }
} as const;
