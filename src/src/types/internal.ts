// 
// 全部未使用
// 

export type NiconamaClientLog = {
  info: [NiconamaClientInfo],
  error: [NiconamaClientError],
};

export type NiconamaClientInfo = NiconamaClientAnyInfo | NiconamaClientReconnectInfo;
export interface NiconamaClientAnyInfo {
  type: "any_info";
  message: string;
}
export interface NiconamaClientReconnectInfo {
  type: "reconnect";
  /** 再接続までの待機時間. 値が無い場合は再接続に成功した */
  sec?: number;
}

/**
 * ニコ生クライアントの`onInfo`で通知されるメッセージ\
 * throw されるエラーではない
 */
export type NiconamaClientError = NiconamaClientUnknownError | NiconamaClientNetworkError | NiconamaClientReconnectFailed;
export interface NiconamaClientUnknownError {
  type: "unknown_error";
  error: unknown;
}
export interface NiconamaClientNetworkError {
  type: "network_error";
  error: Error;
}
export interface NiconamaClientReconnectFailed {
  type: "reconnect_failed";
}
