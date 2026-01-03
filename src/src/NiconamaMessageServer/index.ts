export * from "./type";

import type { GenMessage } from "@bufbuild/protobuf/codegenv2";
import { AsyncIteratorFilter, isAbortError, Re, sleep } from "../utils";
import { dwango, protobuf } from "../_protobuf";
import { NiconamaMessageServerInfo } from "../NiconamaWs";
import { ResponseIteratorSet } from "../utility/network";
import { createEntryFetcher, createMessageFetcher } from "./internal";
import type { NiconamaBackwardResponse, NiconamaEntryAt, NiconamaMessageServerClient } from "./type";

/**
 * ニコ生のメッセージサーバーと通信するための関数郡
 */
export const NiconamaMessageServer = {
  /**
   * ニコ生メッセージサーバーと通信するクライアントを返します
   * 
   * 次の２つの接続を作成します
   * - エントリー: メッセージチャンク接続先を取得し続ける
   * - メッセージ: コメント等の実際に欲しいデータを取得し続ける
   * @param viewUri メッセージサーバーURL. {@link NiconamaMessageServerInfo.viewUri}
   * @param entryAt エントリーの取得開始位置 @default "now"
   * @param abortController {@link AbortController}
   * @returns ニコ生メッセージサーバーと通信するクライアント
   */
  connectClient: (
    viewUri: NiconamaMessageServerInfo["viewUri"],
    entryAt: NiconamaEntryAt,
    filter?: AsyncIteratorFilter<dwango.ChunkedMessage> | undefined,
    abortController: AbortController = new AbortController()
  ): Re.ResultAsync<NiconamaMessageServerClient> => {
    return createEntryFetcher(viewUri, entryAt, abortController)
      .map((entryFetcher) => ({
        entryFetcher,
        messageFetcher: createMessageFetcher(entryFetcher, filter)
      }));
  },
  /**
   * エントリーチャンクを取得するイテレータを返します
   * @param viewUri メッセージサーバーURL. {@link NiconamaMessageServerInfo.viewUri}
   * @param at 取得するコメントの時刻
   * @param signal 接続確立前にキャンセルするためのシグナル
   */
  fetchEntry: async (
    viewUri: NiconamaMessageServerInfo["viewUri"],
    at: NiconamaEntryAt,
    signal?: AbortSignal,
  ): Promise<ResponseIteratorSet<GenMessage<dwango.ChunkedEntry>>> => {
    return await ResponseIteratorSet.fetch(`${viewUri}?at=${at}`, dwango.ChunkedEntrySchema, signal);
  },
  /**
   * メッセージチャンクを取得するイテレータを返します
   * @param messageUri 接続先
   * @param signal {@link AbortSignal}
   */
  fetchMessage: async (
    messageUri: string,
    signal?: AbortSignal,
  ): Promise<ResponseIteratorSet<GenMessage<dwango.ChunkedMessage>>> => {
    return await ResponseIteratorSet.fetch(messageUri, dwango.ChunkedMessageSchema, signal);
  },
  /**
   * 過去コメントを取得します\
   * abrotで中断した場合はそこまでのメッセージを返します
   * @param backwardUri 接続先
   * @param delayMs １セグメント取得する毎に待機する時間 @default 1000
   * @param maxSegmentCount 取得するセグメントの最大数. @default 制限無し
   * @param isSnapshot スナップショットを取得するか @default false
   * @param signal {@link AbortSignal}
   */
  fetchBackwardMessages: async (
    backwardUri: string,
    option: {
      delayMs?: number;
      maxSegmentCount?: number;
      isSnapshot?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<NiconamaBackwardResponse> => {
    const {
      delayMs = 1000,
      maxSegmentCount = Number.MAX_SAFE_INTEGER,
      isSnapshot = false,
      signal,
    } = option;

    const buf: dwango.ChunkedMessage[][] = [];
    let nextUri: string | undefined = backwardUri;
    let segmentUri: string | undefined;
    let snapshotUri: string | undefined;

    try {
      while (true) {
        const res = await fetch(nextUri, { signal });
        const body = new Uint8Array(await res.arrayBuffer());
        const packed = protobuf.fromBinary(dwango.PackedSegmentSchema, body);
        segmentUri = packed.next?.uri;
        snapshotUri = packed.snapshot?.uri;
        nextUri = isSnapshot ? snapshotUri : segmentUri;
        buf.push(packed.messages);

        if (nextUri == null || buf.length >= maxSegmentCount) break;
        await sleep(delayMs, signal);
      }
    } catch (e) {
      if (!isAbortError(e, signal)) throw e;
    }

    const messages = buf.reverse().flat();
    return { messages, segmentUri, snapshotUri };
  },
} as const;
