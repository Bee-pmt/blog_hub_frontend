"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ManagedUser } from "@/modules/users/types";
import { dateLabel } from "@/lib/utils";
import { errorMessage } from "@/lib/api-client";
import {
  useGetUsersQuery,
  useUpdateUserMutation,
} from "../store/services/userApi";
import { queryError } from "@/lib/api/baseApi";
import { useForm } from "react-hook-form";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import ConfirmDialog from "@/modules/base/components/confirm-dialog";

export default function UserManager() {
  const { user, restore } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const {
    currentData: data,
    isFetching: loading,
    error: loadError,
    refetch,
  } = useGetUsersQuery({ q: query, page });
  const [updateManagedUser] = useUpdateUserMutation();
  const searchForm = useForm<{ q: string }>({ defaultValues: { q: "" } });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    account: ManagedUser;
    change: { role: ManagedUser["role"] } | { status: ManagedUser["status"] };
  } | null>(null);

  if (data && !loading && page > Math.max(1, data.totalPages))
    setPage(Math.max(1, data.totalPages));
  async function save() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateManagedUser({
        id: pending.account.id,
        change: pending.change,
      }).unwrap();
      toast.success("Account updated.");
      if (pending.account.id === user?.id) await restore();
    } catch (failure) {
      const message = errorMessage(failure);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>User management</h1>
        </div>
      </div>
      <p className="muted users-description">
        Manage account access and roles. Deactivating an account signs it out
        and preserves its stories.
      </p>
      <form
        className="search-form user-search"
        onSubmit={searchForm.handleSubmit(({ q }) => {
          const search = q.trim();
          setQuery(search);
          setPage(1);
          if (search === query && page === 1) void refetch();
        })}
      >
        <label>
          Search users
          <input
            {...searchForm.register("q")}
            className="form-control"
            type="search"
            maxLength={254}
            placeholder="Name or email"
            disabled={busy}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={busy}>
          Search
        </button>
        <button
          className="text-link"
          type="reset"
          disabled={busy}
          onClick={() => {
            searchForm.reset({ q: "" });
            setError("");
            setQuery("");
            setPage(1);
          }}
        >
          Clear
        </button>
      </form>
      {(error || loadError) && (
        <div className="notice" role="alert">
          {error || queryError(loadError)}{" "}
          <button
            className="text-link"
            disabled={busy}
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      )}
      {loading ? (
        <p className="loading-state" role="status">
          Loading users…
        </p>
      ) : (
        !error &&
        !loadError &&
        data && (
          <>
            <p className="result-count" role="status">
              {data.total} {data.total === 1 ? "user" : "users"}
              {query ? ` matching “${query}”` : ""} · 10 per page
            </p>
            {!data.items.length ? (
              <div className="empty-state">
                <h2>No users found.</h2>
                <p>Try a different name or email.</p>
              </div>
            ) : (
              <div className="table-scroll user-table-wrap">
                <table className="user-table">
                  <caption className="sr-only">
                    Registered users and account controls
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Name & email</th>
                      <th scope="col">Registered</th>
                      <th scope="col">Role</th>
                      <th scope="col">Status</th>
                      <th scope="col">Account access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((account) => (
                      <tr key={account.id}>
                        <th scope="row">
                          <span className="user-name">
                            {account.displayName}
                            {account.id === user?.id ? " (you)" : ""}
                          </span>
                          <span className="user-email">{account.email}</span>
                        </th>
                        <td>{dateLabel(account.createdAt)}</td>
                        <td>
                          <select
                            className="form-control"
                            aria-label={`Role for ${account.email}`}
                            value={account.role}
                            disabled={busy}
                            onChange={(event) => {
                              const role = event.target
                                .value as ManagedUser["role"];
                              if (role !== account.role)
                                setPending({ account, change: { role } });
                            }}
                          >
                            <option value="author">Author</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>
                          <span className="badge">
                            {account.status === "active"
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="button button-secondary"
                            disabled={busy || account.id === user?.id}
                            title={
                              account.id === user?.id
                                ? "You cannot deactivate your own account"
                                : undefined
                            }
                            onClick={() =>
                              setPending({
                                account,
                                change: {
                                  status:
                                    account.status === "active"
                                      ? "disabled"
                                      : "active",
                                },
                              })
                            }
                          >
                            {account.status === "active"
                              ? "Deactivate"
                              : "Reactivate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <nav className="pagination" aria-label="User pages">
              <button
                disabled={busy || page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, data.totalPages)}
              </span>
              <button
                disabled={busy || page >= data.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )
      )}
      {pending && (
        <ConfirmDialog
          confirmLabel="Save changes"
          busyLabel="Saving…"
          title={
            "role" in pending.change
              ? "Change account role?"
              : pending.change.status === "disabled"
                ? "Deactivate account?"
                : "Reactivate account?"
          }
          message={
            "role" in pending.change
              ? `Change ${pending.account.displayName} to ${pending.change.role}? Admins can manage all stories, taxonomy, and users.`
              : pending.change.status === "disabled"
                ? `${pending.account.displayName} will be signed out and unable to sign in. Their stories will be preserved.`
                : `${pending.account.displayName} will be able to sign in again with their existing password.`
          }
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void save()}
        />
      )}
    </>
  );
}
