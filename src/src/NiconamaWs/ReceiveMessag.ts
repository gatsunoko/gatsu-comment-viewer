import type { NiconamaAkashicStatus, NiconamaCategory, NiconamaStreamQuality, NiconamaTag } from "../types";
import type { NiconamaDisconectReason } from "./disconnect";

/**
 * `NiconamaWsClient`が受信するメッセージ定義
 */
export type NiconamaWsReceiveMessage =
  | NiconamaWsReceiveMessageServer
  | NiconamaWsReceiveSeat
  | NiconamaWsReceiveAkashic
  | NiconamaWsReceiveStream
  | NiconamaWsReceiveServerTime
  | NiconamaWsReceiveStatistics_Deprecated
  | NiconamaWsReceiveSchedule
  | NiconamaWsReceivePing
  | NiconamaWsReceiveDisconnect
  | NiconamaWsReceiveReconnect
  | NiconamaWsReceivePostCommentResult
  | NiconamaWsReceiveTagUpdated_Deprecated
  | NiconamaWsReceiveTaxonomy
  | NiconamaWsReceiveStreamQualities
  | NiconamaWsReceiveEnquete
  | NiconamaWsReceiveEnqueteresult
  | NiconamaWsReceiveModerator
  | NiconamaWsReceiveRemoveModerator;


/**
 * メッセージサーバの情報を通知するメッセージ
 */
export interface NiconamaWsReceiveMessageServer {
  type: "messageServer";
  data: {
    /** メッセージサーバ接続先 */
    viewUri: string;
    /** vpos を計算する基準 (vpos = 0) となる ISO8601 形式の時刻 */
    vposBaseTime: string;
    /**
     * 匿名コメント投稿時に用いられる自身のユーザ ID (ログインユーザのみ取得可能) \
     * 自身が投稿したコメントかどうかを判別する上で使用可能です
     */
    hashedUserId?: string;
  };
}

/**
 * 座席の取得成功を通知するメッセージ\
 * startWatching メッセージへのレスポンスに相当
 */
export interface NiconamaWsReceiveSeat {
  type: "seat";
  data: {
    /**
     * 座席を維持するために送信する keepSeat メッセージの送信間隔時間 (秒)
     */
    keepIntervalSec: number;
  };
}

/**
 * 新市場機能. 生放送ゲームを起動するための情報を通知するメッセージ
 */
export interface NiconamaWsReceiveAkashic {
  type: "akashic";
  /**
   * `status`以外の値は`status:"ready"`の場合のみ存在します\
   * それ以外の場合には`null`
   */
  data: {
    /** Akashicのプレーの状態 */
    status: NiconamaAkashicStatus;
    /** AkashicプレーのID. `status:"ready"`の時に値が存在します */
    playId?: number;
    /** プレートークン. `status:"ready"`の時に値が存在します */
    token?: string;
    /** AGV に渡すプレーヤー ID. `status:"ready"`の時に値が存在します */
    playerId?: number;
    /** AGV に渡す contentUrl (エンジン設定ファイルを取得できる). `status:"ready"`の時に値が存在します */
    contentUrl?: string;
    /** 接続先となるプレーログサーバー. `status:"ready"`の時に値が存在します */
    logServerUrl?: string;
  };
}

/**
 * 視聴できるストリームの情報を通知するメッセージ
 */
export interface NiconamaWsReceiveStream {
  type: "stream";
  data: {
    /** ストリーム URI */
    uri: string;
    /**
     * コメントと視聴ストリームの同期のための API の URL (HLS)\
     * uri から取得できるプレイリストの先頭セグメントが 放送サーバに到着した時刻を取得する API\
     * モバイル端末は動画の表示までに時間がかかるためにコメントの描画とずれる問題の対策のためにあります
     */
    syncUri: string;
    /**
     * ストリームの画質タイプ\
     * 再生するストリームがないときに null が返されます
     */
    quality?: NiconamaStreamQuality;
    /** 視聴可能なストリームの画質タイプの一覧を表す配列 */
    availableQualities: NiconamaStreamQuality[];
    /** 視聴ストリームのプロトコル. `"hls"`が返されます */
    protocol: "hls";
  };
}

/**
 * サーバーの時刻を通知するメッセージ
 */
export interface NiconamaWsReceiveServerTime {
  type: "serverTime";
  data: {
    /** ISO8601 形式のサーバ時刻 (ミリ秒を含む)  */
    currentMs: string;
  };
}

/**
 * 視聴の統計情報を通知するメッセージ\
 * 番組の設定によってはフィールドの値が存在しない場合があります
 *
 * * 将来的には新メッセージサーバから取得できるようになります
 * * 新メッセージサーバから取得できるように変更後このメッセージはアナウンスの上で削除する予定です
 */
export interface NiconamaWsReceiveStatistics_Deprecated {
  type: "statistics";
  data: {
    /** 来場者数 */
    viewers: number;
    /** コメント数 */
    comments: number;
    /** ニコニ広告ポイント数 */
    adPoints: number;
    /** ギフトポイント数 */
    giftPoints: number;
  };
}

/**
 * 放送スケジュールを通知するメッセージ\
 * 放送開始時刻・放送終了時刻が変更された際にも通知されます
 */
export interface NiconamaWsReceiveSchedule {
  type: "schedule";
  data: {
    /** 放送開始時刻 (ISO8601 形式)*/
    begin: string;
    /** 放送終了時刻 (ISO8601 形式)*/
    end: string;
  };
}

/**
 * サーバーから定期的に送られる WebSocket コネクションを維持するための確認メッセージ\
 * コネクション維持のためクライアントからの pong メッセージを必要とします
 */
export interface NiconamaWsReceivePing {
  type: "ping";
}

/**
 * コネクションの切断を通知するメッセージ
 */
export interface NiconamaWsReceiveDisconnect {
  type: "disconnect";
  data: {
    /** 切断の理由 */
    reason: NiconamaDisconectReason;
  };
}

/**
 * WebSocket の再接続要求を通知するメッセージ\
 * 受信後再接続処理を必要とします
 */
export interface NiconamaWsReceiveReconnect {
  type: "reconnect";
  data: {
    /**
     * 再接続用トークン\
     * 再接続時に WebSocket の URL のパラメータ audience_token の値をこの値に書き換えてください
     */
    audienceToken: string;
    /**
     * 再接続するまでの待機時間 (秒)\
     * 再接続するまでこの秒数分待機してください
     */
    waitTimeSec: 10;
  };
}

/**
 * コメント送信 ({@link NiconamaWsSendPostComment}) の結果を通知するメッセージ
 */
export interface NiconamaWsReceivePostCommentResult {
  type: "postCommentResult";
  data: {
    chat: {
      /**
       * コマンド\
       * `184` `white` `naka` `medium` など
       */
      mail: string;
      /** 匿名コメントかどうか. 匿名のとき `1` */
      anonymity: 1;
      /** コメント本文 */
      content: string;
      /** コメントを薄く表示するかどうか */
      restricted: boolean;
    };
  };
}

/**
 * タグに更新があったとき新しいリストを通知するメッセージ\
 * 編集されてから通知まで最大 1 分程度かかります
 *
 * * 将来的には新メッセージサーバから取得できるようになります
 * * 新メッセージサーバから取得できるように変更後このメッセージはアナウンスの上で削除する予定です
 */
export interface NiconamaWsReceiveTagUpdated_Deprecated {
  type: "tagUpdated";
  data: {
    tags: {
      /** 更新後の通常タグ */
      items: NiconamaTag[];
      /** タグ編集が可能か */
      ownerLocked: bigint;
    };
  };
}

/**
 * 現在のカテゴリとタグのリストを通知するメッセージ\
 * {@link NiconamaWsSendGetTaxonomy} に対応する応答
 */
export interface NiconamaWsReceiveTaxonomy {
  type: "taxonomy";
  data: {
    categories: {
      /** 番組のカテゴリタグ */
      main: NiconamaCategory[];
      /** 番組のサブカテゴリタグ */
      sub: NiconamaCategory[];
    };
    tags: {
      /** 通常のタグの情報 */
      items: NiconamaTag[];
      /** タグ編集が可能か */
      ownerLocked: boolean;
    };

  };
}

/**
 * 番組で使用できる画質のリストを通知するメッセージ\
 * {@link NiconamaWsSendGetStreamQualities} に対応する応答
 */
export interface NiconamaWsReceiveStreamQualities {
  type: "streamQualities";
  data: {
    /** 番組で視聴可能な最高画質 */
    max: NiconamaStreamQuality[];
    /** 視聴者が選択可能な画質 */
    visible: NiconamaStreamQuality[];
  };
}

export interface NiconamaWsReceiveEnquete {
  type: "enquete";
  data: any;
}

export interface NiconamaWsReceiveEnqueteresult {
  type: "enqueteresult";
  data: any;
}

export interface NiconamaWsReceiveModerator {
  type: "moderator";
  data: any;
}

export interface NiconamaWsReceiveRemoveModerator {
  type: "removeModerator";
  data: any;
}

