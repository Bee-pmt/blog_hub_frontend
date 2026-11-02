"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { queryError } from "@/lib/api/baseApi";
import type { ReactionSummary, ReactionType } from "../types";
import { useGetReactionsQuery, useReactMutation } from "../store/services/commentApi";

type Props = {
  kind: "blogs" | "comments";
  id: string;
  totals?: Pick<ReactionSummary, "likeCount" | "dislikeCount">;
};

function Reactions({ kind, id, totals, accountId, sessionLoading }: Props & {
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
    <div className="reaction-controls">
      <div className="actions" role="group" aria-label={kind === "blogs" ? "Story reactions" : "Comment reactions"}>
        <button className="button button-secondary" type="button" disabled={disabled}
          aria-pressed={summary?.myReaction === "like"} onClick={() => void choose("like")}>
          Like ({summary?.likeCount ?? "…"})
        </button>
        <button className="button button-secondary" type="button" disabled={disabled}
          aria-pressed={summary?.myReaction === "dislike"} onClick={() => void choose("dislike")}>
          Dislike ({summary?.dislikeCount ?? "…"})
        </button>
      </div>
      {(sessionLoading || isFetching || isLoading) && <p className="field-help" role="status">{isLoading ? "Saving reaction…" : "Loading reactions…"}</p>}
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
