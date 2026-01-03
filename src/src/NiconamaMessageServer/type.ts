import type { dwango } from "../_protobuf";

export type NiconamaEntryAt = number | "now";

interface Fetcher<T> {
  /** イテレータが終了したら解決されるプロミス */
  readonly promise: Promise<void>;
  readonly iterator: AsyncIterableIterator<T>;
  isClosed(): boolean;
  close(): void;
}


export interface EntryFetcher extends Fetcher<dwango.MessageSegment> {
  readonly backwardSegment: dwango.BackwardSegment;
  readonly controller: AbortController;
  getLastEntryAt(): NiconamaEntryAt;
}

export interface MessageFetcher extends Fetcher<dwango.ChunkedMessage> { }

/**
 * ニコ生の過去メッセージ
 */
export interface NiconamaBackwardResponse {
  /**
   * 取得したメッセージ
   */
  readonly messages: dwango.ChunkedMessage[];
  /**
   * 次の過去メッセージを取得するURI
   */
  readonly segmentUri: string | undefined;
  /**
   * 次の過去メッセージを取得するURI (スナップショット)
   */
  readonly snapshotUri: string | undefined;
}

/**
 * ニコ生メッセージサーバーと通信するクライアント
 */
export interface NiconamaMessageServerClient {
  /**
   * メッセージチャンクを取得し続けます\
   * イテレータは`messageFetcher`が消費しているので、直接使用することはありません
   */
  readonly entryFetcher: EntryFetcher;

  /**
   * コメント等のメッセージを取得し続けます
   */
  readonly messageFetcher: MessageFetcher;
}
