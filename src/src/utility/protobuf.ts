import { BinaryReader } from "@bufbuild/protobuf/wire";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { protobuf } from "../_protobuf";

export function timestampToMs(timestamp: Timestamp) {
  return Number(timestamp.seconds) * 1e3 + timestamp.nanos / 1e6;
}

/**
 * `a`より`b`の方が大きいか\
 * 同じ場合は`false`を返す
 * @returns `a`より`b`の方が大きいなら`true`
 */
export function timestampLargeA(a: Timestamp, b: Timestamp): boolean {
  return (
    a.seconds < b.seconds ||
    (a.seconds === b.seconds && a.nanos < b.nanos)
  );
}

export async function* readableStreamToAsyncIterable<T>(
  reader: ReadableStreamDefaultReader<T>
) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

export function readStream<Desc extends protobuf.DescMessage>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  desc: Desc,
): AsyncGenerator<protobuf.MessageShape<Desc>> {
  const iterable = readableStreamToAsyncIterable(reader);
  return sizeDelimitedDecodeStream(desc, iterable);
}

// https://github.com/bufbuild/protobuf-es/blob/main/workspaces/protobuf/src/wire/size-delimited.ts#L51
// この関数を再実装する必要はない。デバッグに使っただけ
async function* sizeDelimitedDecodeStream<Desc extends protobuf.DescMessage>(
  messageDesc: Desc,
  iterable: AsyncIterable<Uint8Array>,
  option?: protobuf.BinaryReadOptions,
) {
  // append chunk to buffer, returning updated buffer
  function append(buffer: Uint8Array, chunk: Uint8Array): Uint8Array<ArrayBuffer> {
    const n = new Uint8Array(buffer.byteLength + chunk.byteLength);
    n.set(buffer);
    n.set(chunk, buffer.length);
    return n;
  }

  let buffer = new Uint8Array(0);
  for await (const chunk of iterable) {
    buffer = append(buffer, chunk);

    while (buffer.length > 0) {
      // https://github.com/bufbuild/protobuf-es/blob/main/workspaces/protobuf/src/wire/size-delimited.ts#L107
      const reader = new BinaryReader(buffer);
      const size = reader.uint32();
      const offset = reader.pos;

      if (offset + size > buffer.byteLength) {
        // message is incomplete, buffer more data
        break;
      }

      yield protobuf.fromBinary(
        messageDesc,
        buffer.subarray(offset, offset + size),
        option,
      );

      buffer = buffer.subarray(offset + size);
    }
  }
}
