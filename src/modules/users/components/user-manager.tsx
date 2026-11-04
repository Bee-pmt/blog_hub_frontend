"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ManagedUser } from "../types";
import { dateLabel } from "@/lib/utils";
import { useGetUsersQuery, useUpdateUserMutation } from "../store/services/userApi";
import { queryError } from "@/lib/api/baseApi";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { assignablePermissions, hasPermission } from "@/modules/auth/permissions";
import ConfirmDialog from "@/modules/base/components/confirm-dialog";

function AccessForm({ account, onClose }: { account: ManagedUser; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [permissions, setPermissions] = useState<string[]>(
    account.role === "author" ? [] : (account.permissions ?? []).filter(
      value => assignablePermissions.some(option => option === value),
    ),
  );
  const [update, { isLoading }] = useUpdateUserMutation();
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-label={`Access for ${account.displayName}`}
      onCancel={event => { event.preventDefault(); if (!isLoading) onClose(); }}
    >
      <form className="stack" onSubmit={async event => {
        event.preventDefault();
        if (isLoading) return;
        setError("");
        try {
          await update({
            id: account.id,
            change: account.role === "author" ? { role: "admin", permissions } : { permissions },
          }).unwrap();
          toast.success("Account access updated.");
          onClose();
        } catch (error) {
          setError(queryError(error));
        }
      }}>
        <h2>{account.role === "author" ? "Promote to admin" : "Edit permissions"}</h2>
        <p>
          {account.displayName} will have only the permissions selected below.
          Clearing all permissions revokes administrative access.
        </p>
        <fieldset disabled={isLoading} className="stack">
          <legend>Administrative permissions</legend>
          {assignablePermissions.map(permission => (
            <label key={permission} className="permission-option">
              <input
                type="checkbox"
                checked={permissions.includes(permission)}
                onChange={event => setPermissions(current => event.target.checked
                  ? [...current, permission]
                  : current.filter(value => value !== permission))}
              />
              {permission}
            </label>
          ))}
        </fieldset>
        {error && <p className="notice" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="button button-secondary" disabled={isLoading} autoFocus onClick={onClose}>Cancel</button>
          <button className="button button-primary" disabled={isLoading}>{isLoading ? "Saving…" : "Save access"}</button>
        </div>
      </form>
    </dialog>
  );
}

export default function UserManager() {
  const { user } = useAuth();
  const allowed = hasPermission(user, "users.manage");
  const canGrant = hasPermission(user, "users.grant_access");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [page, setPage] = useState(1);
  const { currentData: data, isFetching, error, refetch } = useGetUsersQuery({ q: query, page }, { skip: !allowed });
  const [update, { isLoading }] = useUpdateUserMutation();
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [pending, setPending] = useState<ManagedUser | null>(null);
  const [failure, setFailure] = useState("");

  if (data && !isFetching && page > Math.max(1, data.totalPages)) setPage(Math.max(1, data.totalPages));
  if (!allowed) return <p role="alert">You do not have permission to manage users.</p>;

  return (
    <>
      <div className="section-heading"><h1>User management</h1></div>
      <p className="muted users-description">
        Manage account access. Disabling an account signs it out and preserves its stories.
      </p>
      <form className="search-form user-search" onSubmit={event => {
        event.preventDefault();
        setQuery(input.trim());
        setPage(1);
        if (query === input.trim() && page === 1) void refetch();
      }}>
        <label>
          Search users
          <input className="form-control" type="search" maxLength={254} value={input}
            onChange={event => setInput(event.target.value)} placeholder="Name or email" />
        </label>
        <button className="button button-primary">Search</button>
        <button type="button" className="text-link" onClick={() => {
          setInput(""); setQuery(""); setPage(1);
        }}>Clear</button>
      </form>
      {(failure || error) && (
        <p className="notice" role="alert">
          {failure || queryError(error)}{" "}
          <button className="text-link" onClick={() => { setFailure(""); void refetch(); }}>Refresh users</button>
        </p>
      )}
      {isFetching ? <p role="status">Loading users…</p> : !error && data && (
        <>
          <p className="result-count">{data.total} {data.total === 1 ? "user" : "users"} · 10 per page</p>
          {!data.items.length ? <div className="empty-state"><h2>No users found.</h2></div> : (
            <div className="table-scroll user-table-wrap">
              <table className="user-table">
                <caption className="sr-only">Registered users and account controls</caption>
                <thead><tr><th scope="col">Name & email</th><th scope="col">Registered</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Account access</th></tr></thead>
                <tbody>
                  {data.items.map(account => {
                    const protectedAccount = account.role === "super_admin" || hasPermission(account, "users.grant_access");
                    const canChangeStatus = !protectedAccount && account.id !== user?.id &&
                      (account.role === "author" || user?.role === "super_admin");
                    return (
                      <tr key={account.id}>
                        <th scope="row">
                          <span className="user-name">{account.displayName}{account.id === user?.id ? " (you)" : ""}</span>
                          <span className="user-email">{account.email}</span>
                        </th>
                        <td>{dateLabel(account.createdAt)}</td>
                        <td>{account.role.replaceAll("_", " ")}</td>
                        <td><span className="badge">{account.status === "active" ? "Active" : "Inactive"}</span></td>
                        <td>
                          <div className="actions">
                            {canGrant && !protectedAccount && (
                              <button className="text-link" disabled={isLoading} onClick={() => setEditing(account)}>
                                {account.role === "author" ? "Promote to admin" : "Edit permissions"}
                              </button>
                            )}
                            {canChangeStatus && (
                              <button className="button button-secondary" disabled={isLoading} onClick={() => setPending(account)}>
                                {account.status === "active" ? "Deactivate" : "Reactivate"}
                              </button>
                            )}
                            {protectedAccount && <span className="muted">Protected account</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <nav className="pagination" aria-label="User pages">
            <button disabled={page <= 1 || isLoading} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {Math.max(1, data.totalPages)}</span>
            <button disabled={page >= data.totalPages || isLoading} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        </>
      )}
      {canGrant && editing && <AccessForm key={editing.id} account={editing} onClose={() => setEditing(null)} />}
      {pending && (
        <ConfirmDialog
          title={pending.status === "active" ? "Deactivate account?" : "Reactivate account?"}
          message={pending.status === "active"
            ? `${pending.displayName} will be signed out. Their stories will be preserved.`
            : `${pending.displayName} will be able to sign in again.`}
          confirmLabel="Save changes"
          busyLabel="Saving…"
          busy={isLoading}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            if (isLoading) return;
            try {
              await update({ id: pending.id, change: { status: pending.status === "active" ? "disabled" : "active" } }).unwrap();
              toast.success("Account updated.");
            } catch (error) {
              setFailure(queryError(error));
            } finally {
              setPending(null);
            }
          }}
        />
      )}
    </>
  );
}
