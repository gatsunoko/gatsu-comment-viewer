import { dwango, wkt } from "./_protobuf";
import  { NiconamaMessageServer } from "./NiconamaMessageServer";
import {  NiconamaPageContext, NiconamaPage } from "./NiconamaPage";
import  { NiconamaWsReceiveMessage, NiconamaWsConnectOption, NiconamaWs } from "./NiconamaWs";
import { timestampLargeA } from "./utility/protobuf";
import  { Re, AsyncIteratorFilter } from "./utils";

/**
 * ニコ生と通信するクライアント\
 * 内部では１つの WebSocket と HTTP ポーリング接続を使用しています\
 * WebSocket と HTTP 接続は互いに独立しているため、どちらか一方が切断されてももう一方は影響を受けません
 * 
 * `commentIterator`が中断されると、HTTP接続が閉じられます\
 * `wsMessageIterator`が中断されると、WebSocket接続が閉じられます
 */
export interface NiconamaClient {
  /**
   * 接続時の生放送の情報
   */
  readonly pageContext: NiconamaPageContext;

  /**
   * コメント等の情報を受け取るイテレータ\
   * HTTP 接続が切断されると、イテレータも終了します
   *
   * イテレータを中断すると、HTTP接続が閉じられます
   */
  readonly messageIterator: AsyncIterableIterator<dwango.ChunkedMessage>;
  /**
   * WebSocket の受信したデータを受け取るイテレータ\
   * WebSocket 接続が切断されると、イテレータも終了します
   * 
   * イテレータを中断すると、WebSocket接続が閉じられます
   */
  readonly wsMessageIterator: AsyncIterableIterator<NiconamaWsReceiveMessage>;

  /** WebSocket が切断されている場合に再接続します */
  connectWs(): Re.ResultAsync<void>;
  /** HTTP が切断されている場合に再接続します */
  connectMsg(): Re.ResultAsync<void>;
  /** WebSocket が接続されている場合に切断します */
  disconnectWs(): void;
  /** HTTP が接続されている場合に切断します */
  disconnectMsg(): void;
}


/**
 * ニコ生と接続するクライアントを生成します
   * @param urlOrId 接続する放送ID. `lv*` `ch*` `user/*` を含む文字列
   * @param option ニコ生視聴ウェブソケットの接続オプション
 */
export function createNiconamaClient(
  urlOrId: string,
  option?: NiconamaWsConnectOption,
): Re.ResultAsync<NiconamaClient> {
  let newestMeta: (dwango.ChunkedMessage_Meta & { at: wkt.Timestamp; }) | undefined;

  return NiconamaPage.fetchNiconamaPageContext(urlOrId)
    .andThen((pageData, controller) =>
      NiconamaWs.connectClient(pageData, option, controller)
        .map(wsClient => [pageData, wsClient] as const)
    )
    .andThen(([pageData, wsClient], controller) =>
      NiconamaMessageServer.connectClient(wsClient.messageServerInfo.viewUri, "now", updateMeta, controller)
        .map(msgClient => [pageData, wsClient, msgClient] as const)
    )
    .map<NiconamaClient>(([pageContext, wsClient, msgClient]) => {
      return {
        pageContext,
        get messageIterator() { return msgClient.messageFetcher.iterator; },
        get wsMessageIterator() { return wsClient.iterator; },
        connectWs, connectMsg,
        disconnectWs: () => wsClient.ws.close(),
        disconnectMsg: () => msgClient.entryFetcher.close(),
      } satisfies NiconamaClient;


      function connectWs(): Re.ResultAsync<void> {
        const state = wsClient.ws.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) return Re.okAsync(void 0);

        return NiconamaWs.connectClient(pageContext, {
          ...option,
          reconnectInfo: {
            messageServerInfo: wsClient.messageServerInfo,
            websocketUrl: wsClient.ws.url,
          }
        })
          .map(client => { wsClient = client; });
      }
      function connectMsg(): Re.ResultAsync<void> {
        if (!msgClient.entryFetcher.isClosed()) return Re.okAsync(void 0);
        const entryAt = msgClient.entryFetcher.getLastEntryAt();

        return NiconamaMessageServer.connectClient(wsClient.messageServerInfo.viewUri, entryAt, skipToLatMeta)
          .map(client => { msgClient = client; });
      }
    });


  function skipToLatMeta({ meta }: dwango.ChunkedMessage): ReturnType<AsyncIteratorFilter> {
    if (meta?.at == null) return false;

    if (meta.id === newestMeta!.id) return [false, updateMeta];
    if (timestampLargeA(newestMeta!.at, meta.at)) {
      newestMeta = meta as typeof newestMeta;
      return [true, updateMeta];
    }

    return false;
  }

  function updateMeta(message: dwango.ChunkedMessage): ReturnType<AsyncIteratorFilter> {
    if (message.meta?.at != null) {
      newestMeta = message.meta as typeof newestMeta;
    }
    return true;
  }
}
