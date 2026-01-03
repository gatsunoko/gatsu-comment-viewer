export * from "./type";

import { createSearchParams, Re } from "../utils";
import type { NiconamaCommentColor_Fixed } from "../types";
import { getNiconamaId } from "../utility/utils";
import type { NiconamaLoginUser, NiconamaPageContext } from "./type";

/**
 * ニコ生の視聴ページで可能な一般的な操作を行う関数郡\
 * ニコ生への一般的なアクセスはこのモジュールを通して行います
 */
export const NiconamaPage = {
  /**
   * ニコ生視聴ページから情報を取得します
   * @param urlOrId 接続する放送ID. `lv*` `ch*` `user/*` を含む文字列
   * @returns
   * - ok: ニコ生ページ情報
   * - err: `[reason: string] | [reason: string, response: Response]`
   */
  fetchNiconamaPageContext: (urlOrId: string): Re.ResultAsync<NiconamaPageContext> =>
    getNiconamaId(urlOrId)
      .andThenAsync(liveId =>
        Re.fetch(`https://live.nicovideo.jp/watch/${liveId}`)
          .andThen<Response>(res => {
            if (res.ok) return Re.ok(res);
            return Re.err(new Error(`放送ページの取得に失敗しました. ID: ${liveId} status: ${res.status}`));
          })
      )
      .map(res => res.text())
      .map(value => new DOMParser().parseFromString(value, "text/html"))
      .map(parseNiconamaPageContext),
  /**
   * 放送者コメントを投稿します
   * @param context ニコ生視聴ページの情報
   * @param text 投稿するコメント
   * @param name 投稿者名
   * @param isPermanent コメントを固定するか @default false
   * @param color コメントの色 @default "black"
   * @returns
   * - ok: {@link Response}
   * - err: `[reason: string] | [reason: string, response: Response]`
   */
  postBroadcasterComment: (
    context: NiconamaPageContext,
    text: string,
    option?: {
      name?: string;
      isPermanent?: boolean;
      color?: NiconamaCommentColor_Fixed;
    }
  ): Re.ResultAsync<Response> => {
    const { broadcasterCommentToken, liveId } = context;
    if (broadcasterCommentToken == null) return Re.errAsync(new Error("放送者コメントトークンが存在しません"));

    return Re.fetch(
      `https://live2.nicovideo.jp/unama/api/v3/programs/${liveId}/broadcaster_comment`,
      {
        headers: { accept: "application/json", "x-public-api-token": broadcasterCommentToken },
        // "content-type": "application/x-www-form-urlencoded",
        body: createSearchParams(
          ["text", text],
          ["name", option?.name],
          ["isPermanent", option?.isPermanent],
          ["color", option?.color],
        ),
        method: "PUT",
        credentials: "include",
      },
    )
      .andThen(res => {
        if (res.ok) return Re.ok(res);
        return Re.err(new Error(`コメントの送信に失敗しました. status:${res.status}`));
      });
  },
  /**
   * 放送者の固定コメントを削除します
   * @param context ニコ生視聴ページの情報
   * @returns
   * - ok: {@link Response}
   * - err: `[reason: string] | [reason: string, response: Response]`
   */
  deleteBroadcasterComment: (context: NiconamaPageContext): Re.ResultAsync<Response> => {
    const { broadcasterCommentToken, liveId } = context;
    if (broadcasterCommentToken == null) return Re.errAsync(new Error("放送者コメントトークンが存在しません"));

    return Re.fetch(
      `https://live2.nicovideo.jp/unama/api/v3/programs/${liveId}/broadcaster_comment`,
      {
        headers: { "x-public-api-token": broadcasterCommentToken },
        method: "DELETE",
        credentials: "include",
      },
    )
      .andThen(res => {
        if (res.ok) return Re.ok(res);
        return Re.err(new Error(`コメントの削除に失敗しました. status:${res.status}`));
      });
  },
  /**
   * ニコ生の合言葉を送ります
   * @param context ニコ生視聴ページの情報
   * @param password 合言葉
   * @returns レスポンス
   */
  postPasswordAuth: (context: NiconamaPageContext, password: string): Re.ResultAsync<Response> => {
    const { liveId } = context;
    return Re.fetch(`https://live2.nicovideo.jp/unama/api/v2/programs/${liveId}/password/permission`, {
      headers: {
        "content-type": "application/json",
        "x-niconico-session": "cookie"
      },
      method: "POST",
      body: JSON.stringify({ password }),
    })
      .andThen(res => {
        if (res.ok) return Re.ok(res);
        return Re.err(new Error(`合言葉の送信に失敗しました. status:${res.status}`));
      });
  },
} as const;



/**
 * ニコ生の視聴ページのドキュメントを加工します
 * @param dom ニコ生視聴ページの`Document`
 * @returns 視聴ページを加工した情報
 */
function parseNiconamaPageContext(dom: Document): NiconamaPageContext {
  const embeddedString = dom
    .getElementById("embedded-data")!
    .getAttribute("data-props")!;
  const embedded = JSON.parse(embeddedString);

  const site = embedded?.site;
  const program = embedded?.program;
  const liveId = program?.nicoliveProgramId;

  return {
    websocketUrl: site?.relive?.webSocketUrl,
    beginTime: program?.beginTime,
    endTime: program?.endTime,
    status: program?.status,

    liveId,
    title: program?.title,
    provider: getProvider(embedded),
    loginUser: parseLoginUser(embedded),
    broadcasterCommentToken: site?.relive?.csrfToken,
    rejectedReasons: embedded?.userProgramWatch?.rejectedReasons,
  };
}

function getProvider(embedded: any): NiconamaPageContext["provider"] {
  const program = embedded?.program;
  const socialGroup = embedded?.socialGroup;
  const supplier = program?.supplier;

  // MEMO: program.providerType の "community" は "user" として扱う
  const providerType: "community" | "official" | "channel" =
    program?.providerType;

  if (providerType === "community") {
    return {
      type: "user",
      id: supplier?.programProviderId,
      name: supplier?.name,
    };
  } else if (providerType === "official") {
    return {
      type: "official",
      id: socialGroup?.id,
      name: socialGroup?.name,
      companyName: socialGroup?.companyName,
    };
  } else {
    return {
      type: "channel",
      id: socialGroup?.id,
      name: socialGroup?.name,
      companyName: socialGroup?.companyName,
    };
  }
}

function parseLoginUser(embedded: any): NiconamaLoginUser | undefined {
  const user = embedded.user; // undefined の可能性有り

  if (user?.isLoggedIn !== true) return undefined;

  const id = user?.id + "";
  const creatorCreatorSupportSummary = embedded?.creatorCreatorSupportSummary;
  return {
    id,
    name: user?.nickname,
    isPremium: user?.accountType === "premium",
    isBroadcaster: user?.isBroadcaster,
    isOperator: user?.isOperator,
    creatorSupport: {
      enabled: creatorCreatorSupportSummary?.isSupportable === true,
      isSupported: creatorCreatorSupportSummary?.supporterUserIds?.includes(id) ?? false,
    },
  };
}
