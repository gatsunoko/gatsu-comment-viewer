export namespace Op {
  interface IOption<T> {
    readonly some: boolean;
    readonly none: boolean;

    unwrap(): T;
    unwrapOr(defaultValue: T): T;

    match<U>(handlers: { some: (value: T) => U; none: () => U; }): U;
    map<U>(fn: (val: T) => U): IOption<U>;
  }

  export type Option<T> = Some<T> | None<T>;

  export const Option = {
    fromNullable: <T>(value: T | null | undefined): IOption<T> => {
      return value == null ? new None<T>() : new Some(value);
    }
  } as const;

  export class Some<T> implements IOption<T> {
    readonly kind = "some";
    readonly some = true;
    readonly none = false;

    constructor(private readonly value: T) { }

    unwrap(): T {
      return this.value;
    }
    unwrapOr(_defaultValue: T): T {
      return this.value;
    }

    match<U>(handlers: { some: (value: T) => U; }): U {
      return handlers.some(this.value);
    }
    map<U>(fn: (val: T) => U): Some<U> {
      return new Some(fn(this.value));
    }
  }

  export class None<T> implements IOption<T> {
    readonly kind = "none";
    readonly some = false;
    readonly none = true;

    constructor() { }

    unwrap(): never {
      throw new Error(`Tried to unwrap None`);
    }
    unwrapOr(defaultValue: T): T {
      return defaultValue;
    }

    match<U>(handlers: { none: () => U; }): U {
      return handlers.none();
    }
    map<U>(_fn: (val: T) => U): None<U> {
      return new None<U>();
    }
  }
}
