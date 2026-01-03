import type { NiconamaCommentColor, NiconamaCommentFont, NiconamaCommentPosition, NiconamaCommentSize, NiconamaStream } from "../types";

/**
 * `NiconamaWsClient`が送信するメッセージ定義
 */
export type NiconamaWsSendMessage =
  | NiconamaWsSendStartWatching
  | NiconamaWsSendKeepSeat
  | NiconamaWsSendGetAkashic
  | NiconamaWsSendChangeStream
  | NiconamaWsSendAnswerEnquete
  | NiconamaWsSendPong
  | NiconamaWsSendPostComment
  | NiconamaWsSendGetTaxonomy
  | NiconamaWsSendGetStreamQualities;

/**
* 視聴開始時に必要な情報を求めるメッセージ\
* 成功の場合はストリームやメッセージサーバー情報など複数メッセージが順番で返されます\
* 失敗の場合はエラーメッセージが返されます
*/
export interface NiconamaWsSendStartWatching {
  type: "startWatching";
  data: {
    /** 映像が必要な時のみ指定する必要があります */
    stream?: NiconamaStream;
    /**
     * 座席再利用するか
     * * 未指定時は `false`
     * * `true`の場合は前回取得したストリームを再利用します
     */
    reconnect?: boolean;
  };
}

/**
 * 座席を維持するためのハートビートメッセージ\
 * WebSocketを維持するためには定期的に送る必要があります
 */
export interface NiconamaWsSendKeepSeat {
  type: "keepSeat";
}

/**
 * 新市場機能. 生放送ゲームを起動するための情報を取得するためのメッセージ\
 * 送信するとサーバからクライアントへ akashic メッセージが返されます
 */
export interface NiconamaWsSendGetAkashic {
  type: "getAkashic";
  data: {
    /** 追っかけ再生かどうか. 未指定時は `false` */
    chasePlay?: boolean;
  };
}

/**
 * 視聴ストリームの送信をサーバーに求めるメッセージ\
 * 有効な視聴セッションが既に存在する場合には再作成してサーバからクライアントへ返します
 */
export interface NiconamaWsSendChangeStream {
  type: "changeStream";
  data: NiconamaWsSendStartWatching["data"]["stream"];
}

/**
 * アンケートの回答を送信するメッセージ
 */
export interface NiconamaWsSendAnswerEnquete {
  type: "answerEnquete";
  data: {
    /** 回答番号  (0から8までのインデックス) */
    answer: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  };
}

/**
 * サーバーから定期的に送られる WebSocket コネクションへの応答メッセージ\
 * コネクション維持のため送信が必要です
 */
export interface NiconamaWsSendPong {
  type: "pong";
}

/**
 * コメント投稿用メッセージ
 */
export interface NiconamaWsSendPostComment {
  type: "postComment";
  data: {
    /**
     * コメントの本文\
     * 通常75文字まで. `isAnonymous:false`のときは1024文字まで
     */
    text: string;
    /**
     * 枠が建ってからのコメントの投稿位置 (0.01 秒単位)\
     * 放送開始ではなく、枠が建ってからの時刻
     */
    vpos: number;
    /**
     * 184で投稿する(`true`)か. 未指定時は`false`
     */
    isAnonymous?: boolean;
    /**
     * コメント色. 未指定時は`"white"`
     */
    color?: NiconamaCommentColor;
    /** コメントサイズ. 未指定時は`medium` */
    size?: NiconamaCommentSize;
    /** コメント位置. 未指定時は`naka` */
    position?: NiconamaCommentPosition;
    /** コメントのフォント. 未指定時は`defont` */
    font?: NiconamaCommentFont;
  };
}

/**
 * 番組のカテゴリ/タグを取得するためのメッセージ\
 * 送信すると {@link NiconamaWsReceiveTaxonomy} メッセージが返されます
 * 
 * 視聴開始時に1回だけ送信し以降は tagUpdated で更新を検知して利用する想定
 */
export interface NiconamaWsSendGetTaxonomy {
  type: "getTaxonomy";
}

/**
 * 視聴可能画質一覧を取得するためのメッセージ\
 * 送信すると {@link NiconamaWsReceiveStreamQualities} メッセージが返されます
 */
export interface NiconamaWsSendGetStreamQualities {
  type: "getStreamQualities";
}


/**
 * メッセージを生成するための関数群
 */
export const NiconamaWsSendMessage = {
  startWatching: (data: NiconamaWsSendStartWatching["data"]): NiconamaWsSendStartWatching => ({
    type: "startWatching",
    data,
  }),
  keepSeat: (): NiconamaWsSendKeepSeat => ({ type: "keepSeat" }),
  getAkashic: (data: NiconamaWsSendGetAkashic["data"]): NiconamaWsSendGetAkashic => ({
    type: "getAkashic",
    data,
  }),
  changeStream: (data: NiconamaWsSendChangeStream["data"]): NiconamaWsSendChangeStream => ({
    type: "changeStream",
    data,
  }),
  answerEnquete: (data: NiconamaWsSendAnswerEnquete["data"]): NiconamaWsSendAnswerEnquete => ({
    type: "answerEnquete",
    data,
  }),
  pong: (): NiconamaWsSendPong => ({ type: "pong" }),
  postComment: (data: NiconamaWsSendPostComment["data"]): NiconamaWsSendPostComment => ({
    type: "postComment",
    data,
  }),
  getTaxonomy: (): NiconamaWsSendGetTaxonomy => ({ type: "getTaxonomy" }),
  getStreamQualities: (): NiconamaWsSendGetStreamQualities => ({
    type: "getStreamQualities"
  }),
} as const;
