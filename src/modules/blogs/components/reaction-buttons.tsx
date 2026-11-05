"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { queryError } from "@/lib/api/baseApi";
import type { ReactionSummary, ReactionType } from "../types";
import { useGetCommentsQuery, useGetReactionsQuery, useReactMutation } from "../store/services/commentApi";

type Props = {
  kind: "blogs" | "comments";
  id: string;
  totals?: Pick<ReactionSummary, "likeCount" | "dislikeCount">;
  commentHref?: string;
};

function Reactions({ kind, id, totals, accountId, sessionLoading, commentHref = "#comments" }: Props & {
  accountId?: string;
  sessionLoading: boolean;
}) {
  const pathname = usePathname();
  const [error, setError] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const pending = useRef(false);
  const { currentData, error: loadError, isFetching, refetch } = useGetReactionsQuery(
    { kind, id, accountId },
    { skip: sessionLoading || (!accountId && !!totals), refetchOnMountOrArgChange: true },
  );
  const { currentData: comments, error: commentError, refetch: refreshComments } = useGetCommentsQuery(
    { blogId: id, page: 1 }, { skip: kind !== "blogs" },
  );
  const [react, { isLoading }] = useReactMutation();
  const summary = currentData ?? (!accountId && totals ? { ...totals, myReaction: null } : undefined);
  const disabled = sessionLoading || isFetching || isLoading || needsRefresh || !!loadError || !summary;

  async function refreshSummary() {
    setNeedsRefresh(true);
    try {
      await refetch().unwrap();
      setNeedsRefresh(false);
      setError("");
    } catch (failure) {
      setError(queryError(failure));
    }
  }

  async function choose(type: ReactionType) {
    if (pending.current || disabled) return;
    if (!accountId) {
      setSignIn(true);
      return;
    }
    pending.current = true;
    setError("");
    try {
      await react({ kind, id, accountId, type }).unwrap();
    } catch (failure) {
      setError(queryError(failure));
      const status = failure && typeof failure === "object" && "status" in failure ? failure.status : 0;
      if (status === 0 || (typeof status === "number" && status >= 500)) {
        await refreshSummary();
      }
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className={`reaction-controls reaction-controls-${kind}`}>
      {kind === "blogs" && summary && (
        <p className="reaction-summary">{summary.likeCount + summary.dislikeCount} {summary.likeCount + summary.dislikeCount === 1 ? "reaction" : "reactions"}</p>
      )}
      <div className="actions" role="group" aria-label={kind === "blogs" ? "Story reactions" : "Comment reactions"}>
        <button className="button button-secondary" type="button" disabled={disabled}
          aria-label={`Like (${summary?.likeCount ?? "…"})`} title="Like"
          aria-pressed={summary?.myReaction === "like"} onClick={() => void choose("like")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 10v12H3V10h4Zm0 0 5-8a3 3 0 0 1 3 3v5h5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 22H7" />
          </svg>
          <span>{summary?.likeCount ?? "…"}</span>
        </button>
        <button className="button button-secondary" type="button" disabled={disabled}
          aria-label={`Dislike (${summary?.dislikeCount ?? "…"})`} title="Dislike"
          aria-pressed={summary?.myReaction === "dislike"} onClick={() => void choose("dislike")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 14V2h4v12h-4Zm0 0-5 8a3 3 0 0 1-3-3v-5H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 2H17" />
          </svg>
          <span>{summary?.dislikeCount ?? "…"}</span>
        </button>
        {kind === "blogs" && (
          <a className="button button-secondary reaction-comment" href={commentHref}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4H13a8 8 0 0 1 8 7.5Z" />
            </svg>
            <span>Comment ({comments?.total ?? (commentError ? "?" : "…")})</span>
          </a>
        )}
      </div>
      {(sessionLoading || isFetching || isLoading) && <p className="field-help" role="status">{isLoading ? "Saving reaction…" : "Loading reactions…"}</p>}
      {kind === "blogs" && commentError && <p className="notice" role="alert">
        Unable to load the comment count.{" "}<button className="text-link" onClick={() => void refreshComments()}>Retry comment count</button>
      </p>}
      {signIn && <p><Link className="text-link" href={`/login?returnTo=${encodeURIComponent(pathname)}`}>Sign in to react</Link></p>}
      {(error || loadError) && <p className="notice" role="alert">{error || queryError(loadError)}</p>}
      {(needsRefresh || loadError) && (
        <p className="field-help">
          Refresh the reaction totals before trying again.{" "}
          <button className="text-link" disabled={isFetching} onClick={() => void refreshSummary()}>Refresh reactions</button>
        </p>
      )}
    </div>
  );
}

export default function ReactionButtons(props: Props) {
  const { user, loading } = useAuth();
  return <Reactions key={`${props.kind}:${props.id}:${user?.id}:${user?.role}`}
    {...props} accountId={user?.id} sessionLoading={loading} />;
}
