export * from "./comment";
export * from "./stream";

export type NiconamaId = `${"lv" | "ch" | "user/"}${number}`;

/**
 * ニコ生ゲームのステータス
 */
export const NiconamaAkashicStatus = {
  /** Akashic 起動対象の番組かつプレー可能 */
  ready: "ready",
  /** Akashic 起動対象の番組だがプレーがまだ利用できない */
  prepare: "prepare",
  /** Akashic 起動対象の番組ではないまたはプレーができない */
  none: "none",
} as const;
export type NiconamaAkashicStatus = typeof NiconamaAkashicStatus[keyof typeof NiconamaAkashicStatus];

/**
 * ニコ生の放送タグ
 */
export interface NiconamaTag {
  /** タグ内容 */
  text: string;
  /** ロックされているか (`true`ならカテゴリ?) */
  locked: false;
  /** 大百科リンク. 記事がない場合は省略されます */
  nicopediaArticleUrl?: string;
}

/**
 * ニコ生のカテゴリー
 */
export interface NiconamaCategory {
  /** カテゴリの文字列 */
  text: string;
  /** 大百科リンク. 記事がない場合は省略されます */
  nicopediaArticleUrl?: string;
}
