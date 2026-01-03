
/**
 * クエリパラメータを生成します\
 * `undefined` は無視されます
 * @param queries クエリに指定する値
 * @returns クエリパラメータ文字列
 */
export function createSearchParams(...queries: [name: string, value?: string | number | boolean][]): string {
  const params = new URLSearchParams();
  for (const [key, value] of queries) {
    if (value === undefined) continue;
    params.append(key, value as any);
  }
  return params.toString();
}

/**
 * ArrayBuffer を Base64 エンコードされた文字列に変換します
 * @param buffer 変換する ArrayBuffer
 * @returns Base64 エンコードされた文字列
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // return btoa(
  //   new TextDecoder('iso-8859-1')
  //     .decode(new Uint8Array(buffer))
  // );

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Base64 エンコードされた文字列を ArrayBuffer に変換します
 * @param base64 Base64 エンコードされた文字列
 * @returns 変換された ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

/**
 * `null` または `undefined` の場合に例外を投げます
 * @param value チェックする値
 * @param errorMessage 例外メッセージ @default "value is null or undefined"
 * @returns `value` が `null` または `undefined` でなければその値
 */
export function throwIsNull<T>(value: T | undefined, errorMessage: string = "value is null or undefined"): T {
  if (value == null) throw new Error(errorMessage);
  return value;
}
