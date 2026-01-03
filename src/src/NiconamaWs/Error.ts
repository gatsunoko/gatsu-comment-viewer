import { NiconamaDisconectReason, getNiconamaDisconectReasonDescription } from "./disconnect";
import { NiconamaWsReceiveReconnect } from "./ReceiveMessag";

/**
 * ウェブソケットが再接続要求を受け取った
 */
export class NiconamaWebSocketReconnectError extends Error {
  constructor(
    public readonly data: NiconamaWsReceiveReconnect["data"],
  ) {
    super(`ウェブソケット再接続要求を受け取りました`);
    this.name = "NiconamaWebSocketReconnectError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * ウェブソケットを切断された
 */
export class NiconamaWebSocketDisconnectError extends Error {
  constructor(
    public readonly reason: NiconamaDisconectReason | undefined,
  ) {
    super(`ウェブソケットから切断されました. 理由:${getNiconamaDisconectReasonDescription(reason)}`);
    this.name = "NiconamaWebSocketDisconnectError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * ウェブソケットの終了理由が問題がある場合にエラーを生成する
   * @param reason 理由
   * @returns 生成されたエラー
   */
  static createIfError(reason: NiconamaDisconectReason | undefined): NiconamaWebSocketDisconnectError | undefined {
    if (reason == null || reason === NiconamaDisconectReason.endProgram) return undefined;
    return new NiconamaWebSocketDisconnectError(reason);
  }
}
