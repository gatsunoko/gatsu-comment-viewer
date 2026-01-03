import { NiconamaId } from "../types";

/**
 * ニコ生の視聴ページと通信するための情報
 */
export interface NiconamaPageContext {
  /** ウェブソケットの接続先URL */
  readonly websocketUrl: string;
  /** 開始時刻 UNIX TIME (秒) */
  readonly beginTime: number;
  /** 終了時刻 UNIX TIME (秒) */
  readonly endTime: number;
  /** `RELEASED`: 予約中, `BEFORE_RELEASE`: 配信準備中 */
  readonly status: "RELEASED" | "BEFORE_RELEASE" | "ON_AIR" | "ENDED";

  /** 放送ID (lv) */
  readonly liveId: NiconamaId;
  /** 放送タイトル */
  readonly title: string;
  /** 放送の情報 */
  readonly provider: NiconamaProvider;
  /**
   * ログインしてるユーザーの情報\
   * ない場合は未ログイン
   */
  readonly loginUser: undefined | NiconamaLoginUser;

  /** 放送者コメントを送るためのトークン */
  readonly broadcasterCommentToken: string | undefined;

  /** 接続に失敗した場合の失敗理由 */
  readonly rejectedReasons: NiconamaRejectReason[];
}


/**
 * ニコ生にログインしているユーザー情報
 */
export interface NiconamaLoginUser {
  readonly id: string;
  readonly name: string;
  /** プレミアムか */
  readonly isPremium: boolean;
  /** 配信者かどうか */
  readonly isBroadcaster: boolean;
  /** isBroadcaster:true の場合は`false`になります */
  readonly isOperator: boolean;
  readonly creatorSupport: {
    /** クリエイターサポートが有効かどうか */
    readonly enabled: boolean;
    /** 配信者のクリエイターサポーターになっているか */
    readonly isSupported: boolean;
  };
}


/**
 * ニコ生を放送しているユーザーの情報
 */
export type NiconamaProvider = NiconamaProviderUser | NiconamaProviderOfficial | NiconamaProviderChannel;

//#region NiconamaProviders
/**
 * ユーザー放送
 */
export interface NiconamaProviderUser {
  readonly type: "user";
  /** 放送者ID */
  readonly id: string;
  /** 放送者名 */
  readonly name: string;
}
/**
 * 公式放送
 */
export interface NiconamaProviderOfficial {
  readonly type: "official";
  /** チャンネルID */
  readonly id: `ch${string}`;
  /** チャンネル名 */
  readonly name: string;
  /** 会社名 */
  readonly companyName: "株式会社ドワンゴ";
}
/**
 * チャンネル放送
 */
export interface NiconamaProviderChannel {
  readonly type: "channel";
  /** チャンネルID */
  readonly id: `ch${string}`;
  /** チャンネル名 */
  readonly name: string;
  /** 会社名 */
  readonly companyName: string;
}
//#endregion NiconamaProviders


/**
 * ニコ生接続時のエラーメッセージ一覧
 */
export const NiconamaRejectReason = {
  notLogin: "notLogin",
  noTimeshiftProgram: "noTimeshiftProgram",
  programNotBegun: "programNotBegun",
  notHaveTimeshiftTicket: "notHaveTimeshiftTicket",
  passwordAuthRequired: "passwordAuthRequired",
} as const;
export type NiconamaRejectReason = keyof typeof NiconamaRejectReason;

/**
 * ニコ生接続時のエラーメッセージの説明文
 */
export const NiconamaRejectReasonDisplay = {
  notLogin: "ログインする必要があります",
  noTimeshiftProgram: "タイムシフトが非公開です",
  programNotBegun: "放送が始まっていません",
  notHaveTimeshiftTicket: "放送を視聴する権限がありません",
  passwordAuthRequired: "合言葉が必要です",
} as const satisfies Record<NiconamaRejectReason, string>;
