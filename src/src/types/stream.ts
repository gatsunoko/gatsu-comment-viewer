
/**
 * ニコ生の映像を受信する際に指定する値
 */
export interface NiconamaStream {
  /** 画質 */
  quality: NiconamaStreamQuality;
  /** 画質の制限 (主にabr用. 省略時に無制限)  */
  limit?: NiconamaStreamLimit;
  /** 視聴の遅延 */
  latency: NiconamaStreamLatency;
  /**
   * 追っかけ再生用のストリームを取得するかどうか
   * - 未指定時は `false`
   * - タイムシフトの場合は無視されます
   * - 追っかけ再生が無効な番組で true だとエラーになる
   */
  chasePlay?: boolean;
}

/**
 * ニコ生の映像のクオリティ
 */
export const NiconamaStreamQuality = {
  // 公式チャンネルで利用可能なもの
  // Stream8Mbps1080p60fps: "8Mbps1080p60fps",
  // Stream6Mbps1080p30fps: "6Mbps1080p30fps",
  // Stream4Mbps720p60fps: "4Mbps720p60fps",

  /** アダプティブビットレート */
  abr: "abr",
  /** 3Mbps/720p */
  superHigh: "super_high",
  /** 2Mbps/450p */
  high: "high",
  /** 1Mbps/450p */
  normal: "normal",
  /** 384kbps/288p */
  low: "low",
  /** 192kbps/288p */
  superLow: "super_low",
  /** 音声のみ */
  audioOnly: "audio_only",
  /** 音声のみ (high 相当) */
  audioHigh: "audio_high",
  /**
   * 2Mbps/450p (high 相当) \
   * 放送者専用の画質. 引用時に引用番組の音声を含む. 放送者の音声を含まない
   */
  broadcasterHigh: "broadcaster_high",
  /**
   * 384kbps/288p (low 相当)\
   * 放送者専用の画質. 引用時に引用番組の音声を含む. 放送者の音声を含まない
   */
  broadcasterLow: "broadcaster_low",
} as const;
export type NiconamaStreamQuality = typeof NiconamaStreamQuality[keyof typeof NiconamaStreamQuality];

export const NiconamaStreamLimit = {
  /** 3Mbps/720p */
  super_high: "super_high",
  /** 2Mbps/450p */
  high: "high",
  /** 1Mbps/450p */
  normal: "normal",
  /** 384kbps/288p */
  low: "low",
  /** 192kbps/288p */
  super_low: "super_low",
} as const;
export type NiconamaStreamLimit = typeof NiconamaStreamLimit[keyof typeof NiconamaStreamLimit];

export const NiconamaStreamLatency = {
  /** 低遅延 */
  low: "low",
  /** 高遅延 (安定性重視) */
  high: "high",
} as const;
export type NiconamaStreamLatency = typeof NiconamaStreamLatency[keyof typeof NiconamaStreamLatency];
