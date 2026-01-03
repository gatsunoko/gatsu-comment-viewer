export * from "./connector";

import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { AsyncIteratorSet, isAbortError, promiser } from "../utils";
import type { dwango } from "../_protobuf";
import { NiconamaEntryAt, NiconamaMessageServer } from "../NiconamaMessageServer";
import { NiconamaPageContext } from "../NiconamaPage";
import { NiconamaMessageServerInfo, NiconamaWs, NiconamaWsClient, NiconamaWsReceiveMessage, NiconamaWsReconnectInfo, NiconamaWsSendMessage, NiconamaWsSendPostComment } from "../NiconamaWs";
import type { NiconamaStream } from "../types";
import { timestampLargeA } from "../utility/protobuf";
import { checkCloseMessage } from "../utility/utils";

/**
 * ニコ生と通信する適当な関数郡
 */
export const NiconamaUtility = {
  /**
   * ニコ生ウェブソケットサーバーと通信するオブジェクトを生成します\
   * プロミスはウェブソケットが接続してから値を返します
   * @param pageContext ニコ生視聴ページの情報
   * @param stream 映像を受信する場合に指定します
   * @returns ニコ生ウェブソケットサーバーと通信するオブジェクトを返すプロミス
   */
  createWsServerConnector: (
    pageContext: NiconamaPageContext,
    option?: {
      stream?: NiconamaStream;
    },
  ): AbortAndPromise<NiconamaWsServerConnector> => {
    return AbortAndPromise.new(async abortController => {
      let connectSet = await createConnectSet(undefined, abortController);

      return {
        getPromise: () => connectSet.promise,
        isClosed: () => connectSet.isClosed(),
        getAbortController: () => connectSet.abortController,
        reconnect: (abortController, reconnectTime) => AbortAndPromise.newA(abortController, async abortController => {
          if (!connectSet.isClosed()) return;
          const reconnectInfo: NiconamaWsReconnectInfo = {
            messageServerInfo: connectSet.wsClient.messageServerInfo,
            websocketUrl: connectSet.wsClient.ws.url,
            reconnectTime,
          };
          connectSet = await createConnectSet(reconnectInfo, abortController);
        }),
        getIterator: () => connectSet.wsClient.iterator,
        getWsData: () => connectSet.wsClient,
        getMessageServerInfo: () => connectSet.wsClient.messageServerInfo,
        getLatestSchedule: () => connectSet.wsClient.getLatestSchedule(),
        send: message => connectSet.wsClient.send(message),
        postComment: (text, isAnonymous, options) => connectSet.wsClient.postComment(text, isAnonymous, options),
      } satisfies NiconamaWsServerConnector;
    });

    async function createConnectSet(reconnectInfo: NiconamaWsReconnectInfo | undefined, abortController: AbortController) {
      const wsClient = await NiconamaWs.connectClient(
        pageContext,
        {
          reconnectInfo,
          stream: option?.stream,
        }
      ).unwrap();
      const { promise, resolve } = promiser();
      wsClient.ws.addEventListener("close", onClose);

      return { promise, abortController, wsClient, isClosed };

      function isClosed() {
        const readyState = wsClient.ws.readyState;
        return (
          readyState === WebSocket.CLOSING ||
          readyState === WebSocket.CLOSED ||
          abortController.signal.aborted
        );
      }

      function onClose() {
        wsClient.ws.removeEventListener("close", onClose);
        resolve();
      }
    }
  },
  /**
   * ニコ生メッセージサーバーと通信するオブジェクトを生成します\
   * プロミスはメッセージ受信用のフェッチが成功してから値を返します
   * @param messageServerInfo `NiconamaWsReceiveMessageServer`
   * @param option {@link NiconamaMessageConnectorOption}
   * @returns ニコ生メッセージサーバーと通信するオブジェクトを返すプロミス
   */
  createMessageServerConnector: (
    messageServerInfo: NiconamaMessageServerInfo,
    option?: NiconamaMessageConnectorOption,
  ): AbortAndPromise<NiconamaMessageServerConnector> => {
    return AbortAndPromise.new(async abortController => {
      let connectSet = await createConnectSet(abortController, option);

      return {
        getPromise: () => connectSet.promise,
        isClosed: () => connectSet.entryFetcher.isClosed() && connectSet.messageFetcher.isClosed(),
        getAbortController: () => connectSet.abortController,
        reconnect: abortController => AbortAndPromise.newA(abortController, async abortController => {
          if (!connectSet.entryFetcher.isClosed() || !connectSet.messageFetcher.isClosed()) return;
          connectSet = await createConnectSet(
            abortController,
            {
              at: connectSet.entryFetcher.getLastEntryAt(),
              skipToMeta: connectSet.messageFetcher.getLastMeta(),
              backwardUri: connectSet.messageFetcher.getBackwardUri(),
            }
          );
        }),
        getIterator: () => connectSet.messageFetcher.iterator,
        getBackwardMessages: (delayMs, maxSegmentCount, isSnapshot) => {
          const res = connectSet.messageFetcher.getBackwardMessages(delayMs, maxSegmentCount, isSnapshot);
          return res;
        },
      };
    });

    async function createConnectSet(abortController: AbortController, options: NiconamaMessageConnectorOption | undefined) {
      const entryAt = options?.at ?? "now";
      const entryFetcher = await createEntryFetcher(abortController, messageServerInfo.viewUri, entryAt);
      const backwardUri = options?.backwardUri ?? {
        segment: entryFetcher.backwardSegment.segment?.uri,
        snapshot: entryFetcher.backwardSegment.snapshot?.uri,
      };
      const messageFetcher = await createMessageFetcher(abortController, entryFetcher, options?.skipToMeta, backwardUri);

      return {
        promise: (async () => { await entryFetcher.promise; await messageFetcher.promise; })(),
        abortController,
        entryFetcher,
        messageFetcher,
      };
    }
  },
} as const;

export interface AbortAndPromise<T> {
  readonly abortController: AbortController;
  readonly promise: Promise<T>;
};
export const AbortAndPromise = {
  new<T>(func: (abortController: AbortController) => Promise<T>): AbortAndPromise<T> {
    const abortController = new AbortController();
    return {
      abortController,
      promise: func(abortController),
    };
  },
  newA<T>(abortController: AbortController | undefined, func: (abortController: AbortController) => Promise<T>): AbortAndPromise<T> {
    abortController ??= new AbortController();
    return {
      abortController,
      promise: func(abortController),
    };
  }
} as const;

/**
 * ニコ生のサーバーと通信するコネクターの基底定義です\
 * 再接続(reconnect)するたびに内部状態が更新され新しい値を返すようにする必要があります
 */
export interface INiconamaServerConnector {
  /**
   * 接続が終了したら履行されます\
   * このプロミスは例外は発生させません
   */
  getPromise(): Promise<void>;
  /**
   * 接続が終了しているか
   */
  isClosed(): boolean;
  /**
   * 接続を終了するためのオブジェクトを取得します
   */
  getAbortController(): AbortController;
  /**
   * 再接続します
   * @param abortController 生成されるコネクターのAbortControllerとして利用されます
   */
  reconnect(abortController?: AbortController): AbortAndPromise<void>;
}
/**
 * ニコ生ウェブソケットサーバーと通信するオブジェクト\
 * 再接続(reconnect)するたびに内部状態が更新され新しい値を返すようになります
 * 
 * ウェブソケットは再接続要求を送ってくる場合があります\
 * その場合はイテレータに`NiconamaWebSocketReconnectError`が送られます\
 * その後再接続する場合は`reconnectTime`を渡して再接続してください
 */
export interface NiconamaWsServerConnector extends INiconamaServerConnector {
  /**
   * 再接続します\
   * `NiconamaWebSocketReconnectError`により再接続する場合は `reconnectTime` を指定してください
   * @param abortController 生成されるコネクターのAbortControllerとして利用されます
   * @param reconnectTime 再接続する時刻を表すミリ秒 (この時刻までは再接続をしない)
   */
  reconnect(abortController?: AbortController, reconnectTime?: number): AbortAndPromise<void>;
  /**
   * ニコ生メッセージサーバーからのメッセージを取り出すイテレータを取得します\
   * 取り出された全てのイテレータは状態を共有しています
   */
  getIterator(): AsyncIterable<NiconamaWsReceiveMessage>;
  /**
   * ニコ生のウェブソケットと通信するデータを取得します
   */
  getWsData(): NiconamaWsClient;
  /**
   * {@link NiconamaWsReceiveMessageServer} を取得します
   */
  getMessageServerInfo(): NiconamaMessageServerInfo;
  /**
   * 最新の放送の開始/終了時刻を取得します
   */
  getLatestSchedule(): {
    /** 開始時刻 UNIX TIME (ミリ秒単位) */
    readonly begin: Date;
    /** 終了時刻 UNIX TIME (ミリ秒単位) */
    readonly end: Date;
  };
  /**
   * メッセージを送信します
   * @param message 送信するメッセージ
   */
  send(message: NiconamaWsSendMessage): void;
  /**
   * コメントを投稿します
   * @param text コメント本文
   * @param isAnonymous 匿名か. 未指定時は`false`\
   * ({@link NiconamaWsSendPostComment.data} の`isAnonymous`相当)
   * @param option オプション
   */
  postComment(
    text: string,
    isAnonymous?: boolean,
    option?: Omit<NiconamaWsSendPostComment["data"], "text" | "isAnonymous">,
  ): Promise<void>;
}
/**
 * ニコ生メッセージサーバーと通信するオブジェクト\
 * 再接続(reconnect)するたびに内部状態が更新され新しい値を返すようになります
 */
export interface NiconamaMessageServerConnector extends INiconamaServerConnector {
  /**
   * ニコ生メッセージサーバーからのメッセージを取り出すイテレータを取得します\
   * 取り出された全てのイテレータは状態を共有しています
   */
  getIterator(): AsyncIterable<dwango.ChunkedMessage>;
  /**
   * 過去メッセージを取得します\
   * 取得できる過去メッセージが無い場合は`undefined`を返します
   * @param delayMs １セグメント取得する毎に待機するミリ秒
   * @param maxSegmentCount 最大で取得するセグメント数
   * @param isSnapshot スナップショットを取るか @default false
   * @returns 
   */
  getBackwardMessages(
    delayMs: number,
    maxSegmentCount: number,
    isSnapshot?: boolean,
  ): (
      | {
        /**
         * 過去メッセージの取得を中断する\
         * 中断した場合取れたところまで返す
         */
        readonly abortController: AbortController;
        /**
         * [取得した過去メッセージ, まだ過去メッセージが残っているか]
         */
        readonly messagePromise: Promise<readonly [dwango.ChunkedMessage[], boolean]>;
      }
      | undefined
    );
}

export interface NiconamaMessageConnectorOption {
  /**
   * 接続開始する時刻
   * @default "now"
   */
  readonly at: NiconamaEntryAt;
  /**
   * 指定された場合はこのメタIDと同じかより大きい時刻のメッセージを受信するまでスキップします
   */
  readonly skipToMeta?: (dwango.ChunkedMessage_Meta & { at: Timestamp; });
  /**
   * 指定された場合は次に取得する過去メッセージがこのURIからになります
   */
  readonly backwardUri?: {
    readonly segment: string | undefined;
    readonly snapshot: string | undefined;
  };
}

interface IFetcher<T> {
  /**
   * フェッチが終了したら履行されます\
   * このプロミスは例外は発生させません
   */
  readonly promise: Promise<void>;
  readonly iterator: AsyncIterableIterator<T>;
  isClosed(): boolean;
  /** AbortError を出さずに終了する */
  safeClose(): void;
}
interface EntryFetcher extends IFetcher<dwango.MessageSegment> {
  readonly backwardSegment: dwango.BackwardSegment;
  getLastEntryAt(): NiconamaEntryAt;
}
interface MessageFetcher extends IFetcher<dwango.ChunkedMessage> {
  /**
   * 最後に取得した`dwango.ChunkedMessage_Meta`を取得します\
   * この値は必ず`meta.at`の値が存在します
   */
  getLastMeta(): (dwango.ChunkedMessage_Meta & { at: Timestamp; }) | undefined;
  readonly getBackwardMessages: NiconamaMessageServerConnector["getBackwardMessages"];
  /**
   * 次に取得する過去メッセージのURIを取得します
   */
  getBackwardUri(): { segment: string | undefined; snapshot: string | undefined; };
}

/**
 * `dwango.MessageSegment`を取得するイテレータを含むオブジェクトを生成します\
 * next メッセージが続く限りエントリーメッセージをフェッチし続けます
 * @param abortController AbortController
 * @param entryUri メッセージサーバ接続先
 * @param entryAt 取得開始する時刻
 * @returns 最初のメッセージを取得したら値を返します
 */
async function createEntryFetcher(
  abortController: AbortController,
  entryUri: string,
  entryAt: NiconamaEntryAt,
): Promise<EntryFetcher> {
  const signal = abortController.signal;
  const iteratorSet = AsyncIteratorSet.create<dwango.MessageSegment>({
    breaked: () => iteratorSet.close(),
  });

  const innerAbort = new AbortController();
  const innerSignal = innerAbort.signal;
  signal.addEventListener("abort", safeClose);

  let lastEntryAt: NiconamaEntryAt = entryAt;
  let curretnEntryAt: NiconamaEntryAt | undefined = lastEntryAt;
  let closed = false;
  const backwardPromiser = promiser<dwango.BackwardSegment>();

  const promise = (async () => {
    let receivedSegment = false;
    try {
      let fetchEntry = await NiconamaMessageServer.fetchEntry(entryUri, curretnEntryAt, innerSignal);

      while (true) {
        curretnEntryAt = undefined;

        for await (const { entry: { value, case: _case } } of fetchEntry.iterator) {
          if (_case === "next") {
            curretnEntryAt = Number(value.at);
            lastEntryAt = curretnEntryAt;
          } else if (_case === "segment") {
            receivedSegment = true;
            iteratorSet.enqueue(value);
          } else if (!receivedSegment) {
            if (_case === "backward") {
              backwardPromiser.resolve(value);
            } else if (_case === "previous") {
              iteratorSet.enqueue(value);
            }
          }
        }

        if (curretnEntryAt == null) break;
        fetchEntry = await NiconamaMessageServer.fetchEntry(entryUri, curretnEntryAt, innerSignal);
      }
    } catch (e) {
      backwardPromiser.reject(e);
      if (!signal.aborted && !isAbortError(e, innerSignal)) iteratorSet.fail(e);
    } finally {
      closed = true;
      signal.removeEventListener("abort", safeClose);
      iteratorSet.close();
    }
  })();

  return {
    promise,
    iterator: iteratorSet.iterator,
    isClosed: () => closed,
    safeClose,
    getLastEntryAt: () => lastEntryAt,
    backwardSegment: await backwardPromiser.promise,
  };

  function safeClose() {
    closed = true;
    innerAbort.abort();
  }
}

/**
 * `dwango.MessageSegment`を取得するイテレータを含むオブジェクトを生成します\
 * `entryFetcher.iterator`が続く限りセグメントメッセージをフェッチし続けます
 * @param abortController AbortController
 * @param entryFetcher EntryFetcher
 * @param backwardSegment 次に取得する過去メッセージのURI
 * @param skipToMeta 指定された場合はその次のメッセージからイテレータで取得できます
 * @returns 最初のメッセージを取得したら値を返します
 */
async function createMessageFetcher(
  abortController: AbortController,
  entryFetcher: EntryFetcher,
  skipToMeta: (dwango.ChunkedMessage_Meta & { at: Timestamp; }) | undefined,
  backwardUri: { segment: string | undefined, snapshot: string | undefined; },
): Promise<MessageFetcher> {
  const signal = abortController.signal;
  const iteratorSet = AsyncIteratorSet.create<dwango.ChunkedMessage>({
    breaked: () => iteratorSet.close(),
    filter: skipToMeta == null
      ? metaFilter
      : value => {
        metaFilter(value);
        if (value.meta?.id === skipToMeta.id) return [false, metaFilter];
        if (value.meta?.at != null && timestampLargeA(skipToMeta.at, value.meta.at)) return [true, metaFilter];
        return false;
      },
  });

  const innerAbort = new AbortController();
  const innerSignal = innerAbort.signal;
  signal.addEventListener("abort", safeClose);

  let closed = false;
  let currentBackwardUri = backwardUri;
  let fetchingBackwardSegment = false;
  let lastMeta: (dwango.ChunkedMessage_Meta & { at: Timestamp; }) | undefined;

  const firstPromiser = promiser();
  const promise = (async () => {
    try {
      const { value, done } = await entryFetcher.iterator.next();
      if (done) { firstPromiser.resolve(); return; }
      const { iterator } = await NiconamaMessageServer.fetchMessage(value.uri, innerSignal);
      firstPromiser.resolve();
      for await (const message of iterator) {
        iteratorSet.enqueue(message);
        if (checkCloseMessage(message)) return;
      }
      // ここまで firstPromiser.resolve を呼ぶためのコード分け

      for await (const segment of entryFetcher.iterator) {
        const { iterator } = await NiconamaMessageServer.fetchMessage(segment.uri, innerSignal);
        for await (const message of iterator) {
          iteratorSet.enqueue(message);
          if (checkCloseMessage(message)) return;
        }
      }
    } catch (e) {
      firstPromiser.reject(e);
      if (!signal.aborted && !isAbortError(e, innerSignal)) iteratorSet.fail(e);
    } finally {
      closed = true;
      entryFetcher.safeClose();
      signal.removeEventListener("abort", safeClose);
      iteratorSet.close();
    }
  })();

  await firstPromiser.promise;

  return {
    promise,
    iterator: iteratorSet.iterator,
    isClosed: () => closed,
    safeClose,
    getLastMeta: () => lastMeta,
    getBackwardMessages,
    getBackwardUri: () => currentBackwardUri,
  };

  function metaFilter(message: dwango.ChunkedMessage) {
    updateMeta(message);
    return true;  // Filter は true を返すと値を除外しないのでここは常に true
  }

  function updateMeta(message: dwango.ChunkedMessage): boolean {
    if (message.meta?.at != null) {
      lastMeta = message.meta as typeof lastMeta;
      return true;
    }
    return false;
  }

  function safeClose() {
    closed = true;
    innerAbort.abort();
  }

  function getBackwardMessages(
    delayMs: number,
    maxSegmentCount: number,
    isSnapshot = false,
  ): ReturnType<MessageFetcher["getBackwardMessages"]> {
    if (fetchingBackwardSegment) return undefined;
    const backwardUri = isSnapshot ? currentBackwardUri.snapshot : currentBackwardUri.segment;
    if (backwardUri == null) return;
    fetchingBackwardSegment = true;

    const abortController = new AbortController();
    const messagePromise = (async () => {
      const backward = await NiconamaMessageServer.fetchBackwardMessages(
        backwardUri, {
        delayMs,
        maxSegmentCount,
        isSnapshot,
        signal: abortController.signal,
      }
      );
      currentBackwardUri = { segment: backward.segmentUri, snapshot: backward.snapshotUri };

      if (lastMeta == null) {
        for (let i = backward.messages.length - 1; i >= 0; i--) {
          const message = backward.messages[i];
          if (updateMeta(message)) break;
        }
      }

      if (checkCloseMessage(backward.messages.at(-1))) {
        safeClose();
      }

      const hasNext = currentBackwardUri.segment != null;
      return [backward.messages, hasNext] as const;
    })();

    fetchingBackwardSegment = false;

    return {
      abortController,
      messagePromise,
    };
  }
};
