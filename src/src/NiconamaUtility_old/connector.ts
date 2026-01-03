import { Re } from "../utils";
import { NiconamaMessageServerInfo, NiconamaWsClient, NiconamaWsReceiveMessage, NiconamaWsSendMessage, NiconamaWsSendPostComment } from "../NiconamaWs";
import { dwango } from "../_protobuf";

/**
 * ニコ生のサーバーと通信するコネクターの基底定義です\
 * 再接続(reconnect)するたびに内部状態が更新され新しい値を返すようにする必要があります
 */
interface INiconamaServerConnector {
  /**
   * 接続が終了したら履行されます\
   * このプロミスは例外は発生させません
   */
  // TODO: 名前変えたいよね
  getPromise(): Promise<void>;
  /**
   * 接続が終了しているか
   */
  isClosed(): boolean;
  /**
   * 接続を終了するためのオブジェクトを取得します
   */
  // 関数呼び出しで abort すれば良くない？
  getAbortController(): AbortController;
  /**
   * 再接続します
   */
  // ここで abortController を渡す必要あるぅ?
  reconnect(abortController?: AbortController): Re.ResultAsync<void, string>;
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
  reconnect(abortController?: AbortController, reconnectTime?: number): Re.ResultAsync<void, string>;
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
  getMessageServerData(): Promise<NiconamaMessageServerInfo>;
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
        // TODO: abort 関数で良くない？
        readonly abortController: AbortController;
        /**
         * [取得した過去メッセージ, まだ過去メッセージが残っているか]
         */
        readonly messagePromise: Promise<readonly [dwango.ChunkedMessage[], boolean]>;
      }
      | undefined
    );
}
