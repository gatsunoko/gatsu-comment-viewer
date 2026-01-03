export * from "./disconnect";
export * from "./Error";
export * from "./ReceiveMessag";
export * from "./SendMessage";
export * from "./type";

import { AsyncIteratorSet, promiser, Re, sleep } from "../utils";
import { NiconamaPageContext } from "../NiconamaPage";
import type { NiconamaStream } from "../types";
import { connectWsAndAsyncIterable } from "../utility/network";
import { NiconamaDisconectReason } from "./disconnect";
import { NiconamaWebSocketDisconnectError, NiconamaWebSocketReconnectError } from "./Error";
import { NiconamaWsReceiveMessage } from "./ReceiveMessag";
import { NiconamaWsSendMessage, NiconamaWsSendPostComment } from "./SendMessage";
import { NiconamaMessageServerInfo, NiconamaWsClient, NiconamaWsConnectOption } from "./type";

/**
 * ニコ生のウェブソケットと通信するための関数郡
 */
export const NiconamaWs = {
  /**
   * ニコ生視聴ウェブソケットと通信するクライアントを返します\
   * WebSocket が接続されたらクライアントを返します
   * 
   * 接続開始メッセージの送信や`pong`/`keepSeat`応答は自動で行われます
   * @param context ニコ生視聴ページの情報
   * @param option ニコ生視聴ウェブソケットの接続オプション
   * @returns ニコ生視聴ウェブソケットと通信するクライアント
   */
  connectClient: (
    context: NiconamaPageContext,
    option?: NiconamaWsConnectOption,
    abortController?: AbortController
  ): Re.ResultAsync<NiconamaWsClient> => {
    let latestSchedule: ReturnType<NiconamaWsClient["getLatestSchedule"]>;
    let disconnectMessage: NiconamaDisconectReason | undefined;

    return createWsContextUtil(context, option, abortController)
      .map(async (result, abortController) => {
        latestSchedule = result.latestSchedule;
        const messageServerInfoPromiser = result.messageServerInfoPromiser;

        const [ws, iteratorSet] = await connectMessageWs(
          result.websocketUrl,
          schedule => { latestSchedule = schedule; },
          message => { disconnectMessage = message; },
          onClose,
          messageServerInfoPromiser.resolve,
          abortController?.signal
        );

        const isReconnect = option?.reconnectInfo != null;
        sendStartWatching(ws, isReconnect, option?.stream);

        const messageServerInfo = await messageServerInfoPromiser.promise;

        return [messageServerInfo, ws, iteratorSet.iterator] as const;


        function onClose() {
          const disconnectError = NiconamaWebSocketDisconnectError.createIfError(disconnectMessage);
          if (disconnectError == null) iteratorSet.close();
          else iteratorSet.fail(disconnectError);
        }
      })
      .map<NiconamaWsClient>(([info, ws, iterator]) => ({
        ws,
        iterator,
        messageServerInfo: info,
        getLatestSchedule: () => latestSchedule,
        send: (message: NiconamaWsSendMessage) => send(ws, message),
        postComment: async (text, isAnonymous, options) => {
          NiconamaWs.postComment(
            ws,
            Math.floor((Date.now() - info.vposBaseTime) / 10),
            text,
            isAnonymous,
            options,
          );
        },
      }));
  },
  postComment: (
    ws: WebSocket,
    vpos: number,
    text: string,
    isAnonymous?: boolean,
    option?: Omit<NiconamaWsSendPostComment["data"], "text" | "isAnonymous">,
  ): void => {
    send(ws, NiconamaWsSendMessage.postComment({
      text,
      isAnonymous,
      vpos,
      ...option,
    }));
  },
} as const;



interface MessageServerInfoPromiser {
  promise: Promise<NiconamaMessageServerInfo>;
  resolve?: (data: NiconamaMessageServerInfo) => void;
  reject?: (reason?: any) => void;
}


function createWsContextUtil(
  context: NiconamaPageContext,
  option?: NiconamaWsConnectOption,
  abortController = new AbortController()
): Re.ResultAsync<{
  websocketUrl: string;
  latestSchedule: ReturnType<NiconamaWsClient["getLatestSchedule"]>;
  messageServerInfoPromiser: MessageServerInfoPromiser;
}> {
  // TODO: stream を指定しても未使用なので映像は受信不可能
  const { reconnectInfo, stream } = option ?? {};

  const websocketUrl = reconnectInfo?.websocketUrl ?? context.websocketUrl;
  if (websocketUrl === "") return Re.errAsync(new Error(`放送が非公開または視聴する権限がありません. id:${context.liveId}`));

  const sleepPromise = reconnectInfo?.reconnectTime != null
    ? sleep(reconnectInfo.reconnectTime - Date.now(), abortController.signal)
    : Promise.resolve();
  return Re.awaitable<void>(
    sleepPromise,
    abortController,
    (err) => err as Error,
  )
    .map(() => ({
      websocketUrl,
      latestSchedule: {
        begin: new Date(context.beginTime * 1e3),
        end: new Date(context.endTime * 1e3),
      },
      messageServerInfoPromiser: reconnectInfo?.messageServerInfo != null
        ? { promise: Promise.resolve(reconnectInfo.messageServerInfo) }
        : promiser(),
    }));
}

async function connectMessageWs(
  wsUrl: string,
  updateSchedule: (data: { begin: Date; end: Date; }) => void,
  disconnected: (message: NiconamaDisconectReason) => void,
  onClose: () => void,
  messageServerInfoResolve: ((data: NiconamaMessageServerInfo) => void) | undefined,
  signal?: AbortSignal
): Promise<[WebSocket, AsyncIteratorSet<NiconamaWsReceiveMessage>]> {
  const [ws, iteratorSet] = await connectWsAndAsyncIterable<string, NiconamaWsReceiveMessage>(
    wsUrl,
    {
      receiver: onMessage,
      onClose,
      signal
    }
  );
  return [ws, iteratorSet];

  function onMessage({ data }: MessageEvent<string>): NiconamaWsReceiveMessage {
    const message = parseMessage(data);
    if (message.type === "ping") {
      sendKeepSeatAndPong(ws);
    } else if (message.type === "schedule") {
      updateSchedule({
        begin: new Date(message.data.begin),
        end: new Date(message.data.end),
      });
    } else if (message.type === "messageServer") {
      const { viewUri, vposBaseTime, hashedUserId } = message.data;
      messageServerInfoResolve?.({
        viewUri,
        vposBaseTime: new Date(vposBaseTime).getTime(),
        hashedUserId,
      });
    } else if (message.type === "reconnect") {
      iteratorSet.fail(new NiconamaWebSocketReconnectError(message.data));
      ws.close();
    } else if (message.type === "disconnect") {
      disconnected(message.data.reason);
    }

    return message;
  }
}

function parseMessage(data: string): NiconamaWsReceiveMessage {
  return JSON.parse(data) as NiconamaWsReceiveMessage;
}

function send(ws: WebSocket, message: NiconamaWsSendMessage): void {
  ws.send(JSON.stringify(message));
}

function sendStartWatching(ws: WebSocket, isReconnect?: boolean | undefined, stream?: NiconamaStream): void {
  send(ws, NiconamaWsSendMessage.startWatching({ reconnect: isReconnect, stream }));
}

function sendKeepSeatAndPong(ws: WebSocket): void {
  send(ws, NiconamaWsSendMessage.pong());
  send(ws, NiconamaWsSendMessage.keepSeat());
}

function replaceAudienceToken(websocketUrl: string, audieceToken: string): string {
  const parsedUrl = new URL(websocketUrl);
  parsedUrl.searchParams.set("audience_token", audieceToken);
  return parsedUrl.toString();
}
