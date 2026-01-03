import { AsyncIteratorFilter, AsyncIteratorSet, isAbortError, promiser, Re, signalConnector } from "../utils";
import { NiconamaMessageServer } from ".";
import { dwango, GenMessage } from "../_protobuf";
import { ResponseIteratorSet } from "../utility/network";
import { EntryFetcher, MessageFetcher, NiconamaEntryAt } from "./type";

export function createEntryFetcher(
  viewUri: string,
  entryAt: NiconamaEntryAt,
  abortController?: AbortController,
): Re.ResultAsync<EntryFetcher> {
  const iteratorSet = AsyncIteratorSet.create<dwango.MessageSegment>();
  const backwardPromiser = promiser<dwango.BackwardSegment>();
  const controller = new AbortController();

  let lastEntryAt: NiconamaEntryAt = entryAt;
  let currentEntryAt: NiconamaEntryAt | undefined = lastEntryAt;

  const promise = (async () => {
    let fetchEntry: ResponseIteratorSet<GenMessage<dwango.ChunkedEntry>>;

    try {
      let receivedSegment = false;
      while (true) {
        if (currentEntryAt == null) break;
        fetchEntry = await NiconamaMessageServer.fetchEntry(viewUri, currentEntryAt, controller.signal);
        currentEntryAt = undefined;

        for await (const { entry: { value, case: _case } } of fetchEntry.iterator) {
          if (_case === "next") {
            lastEntryAt = currentEntryAt = Number(value.at);
          } else if (_case === "segment") {
            receivedSegment = true;
            iteratorSet.enqueue(value);
          } else if (!receivedSegment) {
            if (_case === "backward") {
              backwardPromiser.resolve(value);
            } else if (_case === "previous") {
              iteratorSet.enqueue(value);
            }
          }
        }
      }
    } catch (e) {
      backwardPromiser.reject(e);
      if (!isAbortError(e, controller.signal)) iteratorSet.fail(e);
    } finally {
      onClose();
    }
  })();

  const cleanup = signalConnector(abortController?.signal, onClose);

  return Re.awaitable(
    backwardPromiser.promise,
    abortController,
    err => err as Error,
  )
    .map<EntryFetcher>(backwardSegment => ({
      promise,
      iterator: iteratorSet.iterator,
      controller,
      getLastEntryAt: () => lastEntryAt,
      backwardSegment,
      isClosed: () => controller.signal.aborted,
      close: onClose,
    }))
    .inspect(cleanup);


  function onClose() {
    controller.abort();
    iteratorSet.close();
  }
}

export function createMessageFetcher(
  entryFetcher: EntryFetcher,
  filter?: AsyncIteratorFilter<dwango.ChunkedMessage> | undefined,
): MessageFetcher {
  const iteratorSet = AsyncIteratorSet.create<dwango.ChunkedMessage>({ filter });
  const signal = entryFetcher.controller.signal;

  const promise = (async () => {
    try {
      for await (const segment of entryFetcher.iterator) {
        const { iterator } = await NiconamaMessageServer.fetchMessage(segment.uri, signal);
        for await (const message of iterator) {
          iteratorSet.enqueue(message);
          if (checkCloseMessage(message)) break;
        }
      }
    } catch (e) {
      if (!isAbortError(e, signal)) iteratorSet.fail(e);
    } finally {
      onClose();
    }
  })();

  const cleanup = signalConnector(entryFetcher.controller.signal, onClose);

  return {
    promise,
    iterator: iteratorSet.iterator,
    isClosed: () => entryFetcher.isClosed(),
    close: onClose,
  };


  function onClose() {
    cleanup();
    entryFetcher.close();
    iteratorSet.close();
  }
}



function checkCloseMessage(message?: dwango.ChunkedMessage) {
  return (
    message != null &&
    message.payload.case === "state" &&
    message.payload.value.programStatus?.state === dwango.ProgramStatus_State.Ended
  );
}
