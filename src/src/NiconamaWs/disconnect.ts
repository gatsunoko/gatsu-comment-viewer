/**
 * ニコ生放送から切断された理由
 */
export const NiconamaDisconectReason = {
  /** 追い出された */
  takeover: "TAKEOVER",
  /** 座席を取れなかった */
  noPermission: "NO_PERMISSION",
  /** 番組が終了した */
  endProgram: "END_PROGRAM",
  /** 接続生存確認に失敗した */
  pingTimeout: "PING_TIMEOUT",
  /** 同一ユーザからの接続数上限を越えている */
  tooManyConnections: "TOO_MANY_CONNECTIONS",
  /** 同一ユーザの視聴番組数上限を越えている */
  tooManyWatchings: "TOO_MANY_WATCHINGS",
  /** 満席 */
  crowded: "CROWDED",
  /** メンテナンス中 */
  maintenanceIn: "MAINTENANCE_IN",
  /** 上記以外の一時的なサーバエラー */
  serviceTemporarilyUnavailable: "SERVICE_TEMPORARILY_UNAVAILABLE",
} as const;
export type NiconamaDisconectReason = typeof NiconamaDisconectReason[keyof typeof NiconamaDisconectReason];

/**
 * ニコ生放送から切断された理由の説明文
 */
export const NiconamaDisconectReasonDescription = {
  [NiconamaDisconectReason.takeover]: "追い出された",
  [NiconamaDisconectReason.noPermission]: "座席を取れなかった",
  [NiconamaDisconectReason.endProgram]: "番組が終了した",
  [NiconamaDisconectReason.pingTimeout]: "接続生存確認に失敗した (pingTimeout)",
  [NiconamaDisconectReason.tooManyConnections]: "同一ユーザからの接続数上限を越えた",
  [NiconamaDisconectReason.tooManyWatchings]: "同一ユーザの視聴番組数上限を越えた",
  [NiconamaDisconectReason.crowded]: "満席",
  [NiconamaDisconectReason.maintenanceIn]: "メンテナンス中",
  [NiconamaDisconectReason.serviceTemporarilyUnavailable]: "一時的なサーバエラー",
} as const;

/**
 * 切断理由の説明を取得します
 * @param reason 切断理由
 * @returns 説明文
 */
export function getNiconamaDisconectReasonDescription(reason: NiconamaDisconectReason | undefined): string {
  if (reason == null) return "不明 (終了メッセージを受信する前に切断された)";
  return NiconamaDisconectReasonDescription[reason];
}
