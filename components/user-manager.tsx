"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ManagedUser, UserPage } from "@/type/type";
import {
  dateLabel,
  errorMessage,
  getManagedUsers,
  updateManagedUser,
} from "@/lib/api";
import { useAuth } from "./auth-provider";
import ConfirmDialog from "./confirm-dialog";

export default function UserManager() {
  const { api, user, restore } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<UserPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    account: ManagedUser;
    change: { role: ManagedUser["role"] } | { status: ManagedUser["status"] };
  } | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    getManagedUsers(query, page, api)
      .then((result) => {
        if (!active) return;
        if (page > Math.max(1, result.totalPages))
          setPage(Math.max(1, result.totalPages));
        else setData(result);
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, query, page, revision]);

  async function save() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateManagedUser(pending.account.id, pending.change, api);
      toast.success("Account updated.");
      setRevision((value) => value + 1);
      if (pending.account.id === user?.id) await restore();
    } catch (failure) {
      setError(errorMessage(failure));
      toast.error(errorMessage(failure));
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
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setQuery(String(form.get("q") || "").trim());
          setPage(1);
          setRevision((value) => value + 1);
        }}
      >
        <label>
          Search users
          <input
            name="q"
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
            setQuery("");
            setPage(1);
            setRevision((value) => value + 1);
          }}
        >
          Clear
        </button>
      </form>
      {error && (
        <div className="notice" role="alert">
          {error}{" "}
          <button
            className="text-link"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
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
