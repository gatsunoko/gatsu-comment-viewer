
export namespace Re {
  interface IResult<T, E> {
    /**
     * `Ok`かどうかを判定します
     * @example
     * ```ts
     * let ok: Re.ok<number, string>;
     * const result: Re.Result<number, string> = ...
     * if (result.isOk()) {
     *   // result type is Ok<number, never>
     *   ok = result;   // type safe. result: Re.Ok<number, never>
     * }
     * ```
     */
    isOk(): this is Ok<T, never>;
    /**
     * `Err`かどうかを判定します
     * @example
     * ```ts
     * let err: Re.Err<number, string>;
     * const result: Re.Result<number, string> = ...;
     * if (result.isErr()) {
     *   // result type is Err<string, never>
     *   err = result;   // type safe. result: Re.Err<string, never>
     * }
     * ```
     */
    isErr(): this is Err<never, E>;

    /**
     * `ResultAsync`に変換します
     * 
     * TODO: このメソッドは必ずもっと良い形があると思う\
     *       現在は、`andThen`と`toAsync`の２つが合体している
     * @param ok `Ok`の場合に変換する関数
     * @param abortController 中断用のAbortController
     */
    andThenAsync<V>(
      ok: (value: T, abortController?: AbortController) => Promise<Result<V, E>> | ResultAsync<V, E>,
      abortController?: AbortController
    ): ResultAsync<V, E>;

    /**
     * `Ok`の場合はその値を取り出し、`Err`の場合はエラーを投げます
     * @throws {Error} `Err`の場合はエラーを投げます
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.unwrap(); // 42
     * const errResult = Re.err("Error occurred");
     * errResult.unwrap(); // Throws an error: "Tried to unwrap Err: Error occurred"
     * ```
     */
    unwrap(): T;
    /**
     * `Err`の場合はその値を取り出し、`Ok`の場合はエラーを投げます
     * @throws {Error} - `Ok`の場合はエラーを投げます
     * @example
     * ```ts
     * const result = Re.err("Error occurred");
     * result.unwrapErr(); // "Error occurred"
     * const okResult = Re.ok(42);
     * okResult.unwrapErr(); // Throws an error: "Tried to unwrap Ok: 42"
     * ```
     */
    unwrapErr(): E;
    /**
     * `Ok`の場合はその値を取り出し、`Err`の場合は`defaultVal`を返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.unwrapOr(0); // 42
     * const errResult = Re.err("Error occurred");
     * errResult.unwrapOr(0); // 0
     * ```
     */
    unwrapOr(defaultVal: T): T;
    /**
     * `Ok`と`Err`の値に応じて異なる処理を実行し、その結果を返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.match({ ok: (value) => `Value is ${value}` }); // "Value is 42"
     * const errResult = Re.err("Error occurred");
     * errResult.match({ err: (err) => `Error: ${err}` }); // "Error: Error occurred"
     * ```
     */
    match<U>(handlers: { ok: (value: T) => U; err: (err: E) => U; }): U;

    /**
     * `Ok`の場合は`fn`を実行し、その結果を`Ok`で返します\
     * `Err`の場合は元の`Err`を返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.map((value) => value + 1); // Ok(43)
     * const errResult = Re.err("Error occurred");
     * errResult.map((value) => value + 1); // Err("Error occurred")
     * ```
     */
    map<U>(fn: (value: T) => U): IResult<U, E>;
    /**
     * `Err`の場合は`fn`を実行し、その結果を`Err`で返します\
     * `Ok`の場合は元の`Ok`を返します
     * @example
     * ```ts
     * const result = Re.err("Error occurred");
     * result.mapErr((err) => `New error: ${err}`); // Err("New error: Error occurred")
     * const okResult = Re.ok(42);
     * okResult.mapErr((err) => `New error: ${err}`); // Ok(42)
     * ```
     */
    mapErr<E2>(fn: (err: E) => E2): IResult<T, E2>;
    /**
     * `Ok`の場合は`fn`を実行し、その結果を返します\
     * `Err`の場合は`defaultValue`を`Err`で返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.mapOr(0, (value) => value + 1); // 43
     * const errResult = Re.err<number>("Error occurred");
     * errResult.mapOr(0, (value) => value + 1); // 0
     * ```
     */
    mapOr<U>(defaultValue: U, fn: (value: T) => U): U;
    /**
     * `Ok`の場合は`fn`を実行し、その結果を返します\
     * `Err`の場合は`defaultFn`を実行し、その結果を返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.mapOrElse((err) => `Error: ${err}`, (value) => `Value: ${value}`); // "Value: 42"
     * const errResult = Re.err("Error occurred");
     * errResult.mapOrElse((err) => `Error: ${err}`, (value) => `Value: ${value}`); // "Error: Error occurred"
     * ```
     */
    mapOrElse<U>(defaultFn: (err: E) => U, fn: (value: T) => U): U;

    /**
     * `Ok`の場合は`fn`を実行し、その結果を返します\
     * `Err`の場合は元の`Err`を返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.andThen((value) => Re.ok([value])); // Ok([42])
     * const errResult = Re.err("Error occurred");
     * errResult.andThen((value) => Re.ok(value + 1)); // Err("Error occurred")
     * ```
     */
    andThen<U>(fn: (value: T) => IResult<U, E>): IResult<U, E>;
    /**
     * `Err`の場合は`fn`を実行し、その結果を返します\
     * `Ok`の場合は元の`Ok`を返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.orElse((err) => Re.ok(0)); // Ok(42)
     * const errResult = Re.err("Error occurred");
     * errResult.orElse((err) => Re.ok(0)); // Ok(0)
     * ```
     */
    orElse<E2>(fn: (err: E) => IResult<T, E2>): IResult<T, E2>;

    /**
     * `Ok`の場合は`fn`を実行し、`Err`の場合は何もしません\
     * どちらの場合も元の`Result`を返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.inspect((value) => console.log(`Value is ${value}`)); // Logs "Value is 42"
     * const errResult = Re.err("Error occurred");
     * errResult.inspect((value) => console.log(`Value is ${value}`)); // Does nothing
     * ```
     */
    inspect(fn: (value: T) => void): IResult<T, E>;

    /**
     * `Err`の場合は`fn`を実行し、`Ok`の場合は何もしません\
     * どちらの場合も元の`Result`を返します
     * @example
     * ```ts
     * const result = Re.ok(42);
     * result.inspectErr((err) => console.error(`Error: ${err}`)); // Does nothing
     * const errResult = Re.err("Error occurred");
     * errResult.inspectErr((err) => console.error(`Error: ${err}`)); // Logs "Error: Error occurred"
     * ```
     */
    inspectErr(fn: (err: E) => void): IResult<T, E>;

    /**
     * `Err`の場合に内容をそのまま`throw`し、`Ok`の場合はそのまま返します\
     * `Err`のタイプを変換することもできます
     * @example
     * ```ts
     * const result: Re.Result<string, Error> = ...;
     * result
     *   .throwErr<string>()  // Exclude Err case and change type to string
     *   .andThen(value => value.length > 0 ? Re.ok(value) : Re.err("Empty string"));
     * ```
     */
    throwErr<E2 = E>(): IResult<T, E2>;
  }

  export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

  export class Ok<T, E = never> implements IResult<T, E> {
    readonly kind = "ok";

    constructor(private readonly value: T) { }

    isOk(): this is Ok<T, never> {
      return true;
    }
    isErr(): this is Err<never, E> {
      return false;
    }

    andThenAsync<V>(
      ok: (value: T, abortController?: AbortController) => Promise<Result<V, E>> | ResultAsync<V, E>,
      abortController?: AbortController
    ): ResultAsync<V, E> {
      const res = ok(this.value, abortController);
      if (res instanceof ResultAsync) return res;
      return new ResultAsync(res, abortController);
    }

    unwrap(): T {
      return this.value;
    }
    unwrapErr(): never {
      throw new Error(`Tried to unwrap Ok: ${this.value}`);
    }
    unwrapOr(_defaultVal: T): T {
      return this.value;
    }
    match<U>(handlers: { ok: (value: T) => U; err?: (err: never) => U; }): U {
      return handlers.ok(this.value);
    }

    map<U>(fn: (value: T) => U): Ok<U> {
      return new Ok(fn(this.value));
    }
    mapErr<E2>(_fn: (err: never) => E2): Ok<T, E2> {
      return this as unknown as Ok<T, E2>;
    }
    mapOr<U>(_defaultValue: U, fn: (value: T) => U): U {
      return fn(this.value);
    }
    mapOrElse<U>(_defaultFn: (err: never) => U, fn: (value: T) => U): U {
      return fn(this.value);
    }

    andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
      return fn(this.value);
    }
    orElse<E2>(_fn: (err: never) => Result<T, E2>): Result<T, E2> {
      return this as unknown as Result<T, E2>;
    }

    inspect(fn: (value: T) => void): Ok<T, E> {
      fn(this.value);
      return this;
    }
    inspectErr(_fn: (err: never) => void): Ok<T, E> {
      return this;
    }

    throwErr<E2 = E>(): Ok<T, E2> {
      return this as unknown as Ok<T, E2>;
    }
  }

  export class Err<T, E = never> implements IResult<T, E> {
    readonly kind = "err";

    constructor(private readonly value: E) { }

    isOk(): this is Ok<T, never> {
      return false;
    }
    isErr(): this is Err<never, E> {
      return true;
    }

    andThenAsync<V>(_: unknown, abortController?: AbortController): ResultAsync<V, E> {
      return new ResultAsync(Promise.resolve(this as unknown as Err<V, E>), abortController);
    }

    unwrap(): never {
      throw new Error(`Tried to unwrap Err: ${this.value}`);
    }
    unwrapErr(): E {
      return this.value;
    }
    unwrapOr(defaultVal: T): T {
      return defaultVal;
    }
    match<U>(handlers: { ok?: (value: never) => U; err: (err: E) => U; }): U {
      return handlers.err(this.value);
    }

    map<U>(_fn: (value: never) => U): Err<U, E> {
      return this as unknown as Err<U, E>;
    }
    mapErr<E2>(fn: (err: E) => E2): Err<T, E2> {
      return new Err(fn(this.value));
    }
    mapOr<U>(defaultValue: U, _fn: (value: T) => U): U {
      return defaultValue;
    }
    mapOrElse<U>(defaultFn: (err: E) => U, _fn: (value: never) => U): U {
      return defaultFn(this.value);
    }

    andThen<U>(_fn: (value: never) => Result<U, E>): Err<U, E> {
      return this as unknown as Err<U, E>;
    }
    orElse<E2>(defaultFn: (err: E) => Result<T, E2>): Result<T, E2> {
      return defaultFn(this.value);
    }

    inspect(_fn: (value: never) => void): Err<T, E> {
      return this;
    }
    inspectErr(fn: (err: E) => void): Err<T, E> {
      fn(this.value);
      return this;
    }

    throwErr<E2 = E>(): Err<T, E2> {
      throw this.value;
    }
  }

  type Awaitable<T> = T | Promise<T>;

  export class ResultAsync<T, E = Error> {
    constructor(readonly promise: Promise<Result<T, E>>, readonly abortController?: AbortController) { }

    private new<U, E2>(promise: Promise<Result<U, E2>>): ResultAsync<U, E2> {
      return new ResultAsync(promise, this.abortController);
    }

    abort(): void {
      this.abortController?.abort();
    }

    async unwrap(): Promise<T> {
      return (await this.promise).unwrap();
    }
    async unwrapErr(): Promise<E> {
      return (await this.promise).unwrapErr();
    }
    async unwrapOr(defaultVal: T): Promise<T> {
      return (await this.promise).unwrapOr(defaultVal);
    }
    async match<U>(handlers: { ok: (value: T) => U; err: (err: E) => U; }): Promise<U> {
      return (await this.promise).match(handlers);
    }

    map<U>(fn: (value: T, controller?: AbortController) => Awaitable<U>): ResultAsync<U, E> {
      return this.new(this.promise.then(async res => {
        switch (res.isOk()) {
          case true: return new Ok(await fn(res.unwrap(), this.abortController));
          case false: return res as unknown as Err<U, E>;
        }
      }));
    }
    mapErr<E2>(fn: (err: E, controller?: AbortController) => Awaitable<E2>): ResultAsync<T, E2> {
      return this.new(this.promise.then(async res => {
        switch (res.isErr()) {
          case true: return new Err(await fn(res.unwrapErr(), this.abortController));
          case false: return res as unknown as Ok<T, E2>;
        }
      }));
    }
    async mapOr<U>(defaultValue: U, fn: (value: T) => Awaitable<U>): Promise<U> {
      return (await this.promise).mapOr(defaultValue, fn);
    }
    async mapOrElse<U>(defaultFn: (err: E) => Awaitable<U>, fn: (value: T) => Awaitable<U>): Promise<U> {
      return (await this.promise).mapOrElse(defaultFn, fn);
    }

    andThen<U>(
      fn: (value: T, controller?: AbortController) => Awaitable<Result<U, E>> | ResultAsync<U, E>
    ): ResultAsync<U, E> {
      return this.new(this.promise.then(res => {
        if (!res.isOk()) return res as unknown as Err<U, E>;
        const res2 = fn(res.unwrap(), this.abortController);
        if (res2 instanceof ResultAsync) return res2.promise;
        return Promise.resolve(res2);
      }));
    }
    orElse<E2>(fn: (err: E) => Awaitable<Result<T, E2>>): ResultAsync<T, E2> {
      return this.new(this.promise.then(res =>
        res.isErr() ? fn(res.unwrapErr()) : res as unknown as Ok<T, E2>
      ));
    }

    inspect(fn: (value: T) => Awaitable<void>): ResultAsync<T, E> {
      return this.new(this.promise.then(res => {
        if (res.isOk()) fn(res.unwrap());
        return res;
      }));
    }
    inspectErr(fn: (err: E) => void): ResultAsync<T, E> {
      return this.new(this.promise.then(res => {
        if (res.isErr()) fn(res.unwrapErr());
        return res;
      }));
    }

    throwErr<E2 = E>(): ResultAsync<T, E2> {
      return this.new(this.promise.then(res => res.throwErr()));
    }
  }

  export function ok<T, E = never>(value: T): Ok<T, E> {
    return new Ok(value);
  }
  export function err<T, E>(err: E): Err<T, E> {
    return new Err(err);
  }
  export function fromNullable<T>(value: T | null | undefined): Result<T, null> {
    if (value == null) return new Err(null);
    return new Ok(value);
  }

  export function async<T, E = Error>(
    promise: Promise<Result<T, E>>,
    abortController?: AbortController
  ): ResultAsync<T, E> {
    return new ResultAsync(promise, abortController);
  }
  export function asyncUnit<E = never>(abortController?: AbortController): ResultAsync<void, E> {
    return new ResultAsync(Promise.resolve(new Ok(undefined)), abortController);
  }


  export function okAsync<T, E = never>(value: T, abortController?: AbortController): ResultAsync<T, E> {
    return new ResultAsync(Promise.resolve(new Ok(value)), abortController);
  }
  export function errAsync<T, E>(err: E, abortController?: AbortController): ResultAsync<T, E> {
    return new ResultAsync(Promise.resolve(new Err(err)), abortController);
  }

  export function awaitable<T, E = Error>(
    promise: Promise<T>,
    abortController?: AbortController,
    mapErr?: (err: unknown) => E,
  ): Re.ResultAsync<T, E> {
    return Re.async(
      promise.then(value => Re.ok(value))
        .catch(err => {
          if (mapErr) return Re.err(mapErr(err));
          throw err;
        }),
      abortController
    );
  }

  /**
   * `fetch` API を`ResultAsync`型でラップします
   * - ok: リクエストが解決した場合（ステータスが 2xx でなくても）
   * - err: ネットワークエラーや CORS エラーなど
   * @param input `fetch`の第1引数（URL または `Request` オブジェクト）
   * @param init `fetch`の第2引数（オプションの設定）
   * @param controller `init.signal`を上書きします. 未指定時は自動生成されます
   * @returns HTTP 成功時は`Ok<Response>`、失敗時は`Err<Error | DOMException>`を保持する`ResultAsync`
   * @example
   * ```ts
   * const result = await Re.fetch("https://example.com")
   *   .map(res => res.text())
   *   .unwrap();
   * ```
   */
  export function fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    controller = new AbortController(),
  ): ResultAsync<Response> {
    return new ResultAsync(
      globalThis.fetch(input, { ...init, signal: controller.signal })
        .then(res => Re.ok(res))
        .catch(err => Re.err(err)),
      controller
    );
  }
}
