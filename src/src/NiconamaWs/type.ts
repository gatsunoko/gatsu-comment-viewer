import { NiconamaStream } from "../types";
import { NiconamaWsReceiveMessage, NiconamaWsReceiveMessageServer } from "./ReceiveMessag";
import { NiconamaWsSendMessage, NiconamaWsSendPostComment } from "./SendMessage";

/**
 * ニコ生 WebSocket 接続オプション
 */
export interface NiconamaWsConnectOption {
  /**
   * 再接続する際に指定する情報
   */
  reconnectInfo?: NiconamaWsReconnectInfo;
  stream?: NiconamaStream;
}


/**
 * ニコ生のメッセージサーバーの情報\
 * {@link NiconamaWsReceiveMessageServer} を加工したもの
 */
export type NiconamaMessageServerInfo =
  Pick<NiconamaWsReceiveMessageServer["data"], "viewUri" | "hashedUserId"> &
  {
    /** vpos を計算する基準 (vpos = 0) となる時刻 (センチ秒) */
    readonly vposBaseTime: number;
  };

export interface NiconamaWsReconnectInfo {
  /** 再接続時にはこのメッセージが来ないため必須 */
  readonly messageServerInfo: NiconamaMessageServerInfo;
  /** ウェブソケットURL */
  readonly websocketUrl: string;
  /** 再接続する時刻を表すミリ秒 (この時刻までは再接続をしない) */
  readonly reconnectTime?: number;
}

/**
 * ニコ生視聴ウェブソケットと通信するクライアント
 */
export interface NiconamaWsClient {
  /**
   * 接続しているウェブソケット
   */
  readonly ws: WebSocket;
  /**
   * メッセージを取り出すイテレータ
   */
  readonly iterator: AsyncIterableIterator<NiconamaWsReceiveMessage>;
  /**
   * 初回接続時のメッセージサーバの接続先情報
   */
  readonly messageServerInfo: NiconamaMessageServerInfo;

  /**
   * 最新の放送の開始/終了時刻を取得します
   */
  getLatestSchedule(): {
    /** 開始時刻 UNIX TIME (ミリ秒) */
    readonly begin: Date;
    /** 終了時刻 UNIX TIME (ミリ秒) */
    readonly end: Date;
  };
  /**
   * メッセージを送信します
   */
  send(message: NiconamaWsSendMessage): void;
  /**
   * コメントを投稿します
   * @param text コメント本文
   * @param isAnonymous `true`なら184 @default false
   * @param option コメントの色や位置などのオプション
   */
  postComment(
    text: string,
    isAnonymous?: boolean,
    option?: Omit<NiconamaWsSendPostComment["data"], "text" | "isAnonymous">,
  ): Promise<void>;
}
