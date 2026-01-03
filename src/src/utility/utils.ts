import { Re } from "../utils";
import { dwango } from "../_protobuf";
import type { NiconamaId } from "../types";

/**
 * ニコ生のIDを取得します
 * @param urlOrId 放送IDを含む文字列
 * @returns ニコ生のID (`lv*` `ch*` `user/*`)
 */
export function getNiconamaId(urlOrId: string): Re.Result<NiconamaId> {
  const result = /.*((lv|ch|user\/)\d+).*/.exec(urlOrId);
  if (result) return Re.ok(result[1] as NiconamaId);
  return Re.err(new Error(`無効なニコ生IDです: ${urlOrId}`));
}

export function checkCloseMessage(message?: dwango.ChunkedMessage): boolean {
  return (
    message != null &&
    message.payload.case === "state" &&
    message.payload.value.programStatus?.state === dwango.ProgramStatus_State.Ended
  );
}
