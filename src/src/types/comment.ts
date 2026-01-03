/**
 * ニコ生のコメントカラーに指定可能な定数\
 * `*2`はプレミアム専用
 */
export const NiconamaCommentColor_Fixed = {
  white: "white",
  red: "red",
  pink: "pink",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  cyan: "cyan",
  blue: "blue",
  purple: "purple",
  black: "black",
  // ここから下はプレミアム専用
  white2: "white2",
  red2: "red2",
  pink2: "pink2",
  orange2: "orange2",
  yellow2: "yellow2",
  green2: "green2",
  cyan2: "cyan2",
  blue2: "blue2",
  purple2: "purple2",
  black2: "black2",
} as const;
export type NiconamaCommentColor_Fixed = typeof NiconamaCommentColor_Fixed[keyof typeof NiconamaCommentColor_Fixed];

/**
 * ニコ生のコメントカラーに指定可能な文字列
 */
export type NiconamaCommentColor = NiconamaCommentColor_Fixed | `#${string}`;

/**
 * ニコ生のコメントサイズに指定可能な定数
 */
export const NiconamaCommentSize = {
  /** プレミアム専用 */
  big: "big",
  medium: "medium",
  small: "small",
} as const;
export type NiconamaCommentSize = typeof NiconamaCommentSize[keyof typeof NiconamaCommentSize];

/**
 * ニコ生のコメント位置に指定可能な定数
 */
export const NiconamaCommentPosition = {
  /** プレミアム専用 */
  ue: "ue",
  naka: "naka",
  /** プレミアム専用 */
  shita: "shita",
} as const;
export type NiconamaCommentPosition = typeof NiconamaCommentPosition[keyof typeof NiconamaCommentPosition];

/**
 * ニコ生のコメントフォントに指定可能な定数
 */
export const NiconamaCommentFont = {
  defont: "defont",
  mincho: "mincho",
  gothic: "gothic",
} as const;
export type NiconamaCommentFont = typeof NiconamaCommentFont[keyof typeof NiconamaCommentFont];
