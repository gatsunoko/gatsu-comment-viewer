/**
 * 自動でキーと値を生成する、Mapを拡張したクラス
 * @template V 値の型
 */
export class CollectingMap<V> extends Map<number, V> {
  private nextKey = 0;

  constructor(generator: () => V);
  constructor(generator: () => V, iterable?: Iterable<readonly [number, V]> | null);
  constructor(generator: () => V, entries?: readonly (readonly [number, V])[] | null);
  constructor(private generator: () => V, param?: any) {
    super(param);
  }

  /**
   * 新しいキーと値を生成して保存する
   * @returns `[key, value]`
   */
  public generate(): [key: number, value: V] {
    const key = this.nextKey++;
    const value = this.generator();
    this.set(key, value);
    return [key, value];
  }

  /**
   * キーに対応する値を取得し、Mapから削除する
   * @param key キー
   * @returns 削除した値、存在しなければ`undefined`
   */
  public pop(key: number): V | undefined {
    const value = this.get(key);
    if (value != null) this.delete(key);
    return value;
  }
}
