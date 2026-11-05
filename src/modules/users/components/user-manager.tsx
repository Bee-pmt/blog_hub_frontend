"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Tags,
  MessageSquare,
  CircleHelp,
  UsersRound,
  ShieldCheck,
  Search,
  Info,
  TriangleAlert,
  Power,
} from "lucide-react";
import type { ManagedUser } from "../types";
import { dateLabel } from "@/lib/utils";
import {
  useGetUsersQuery,
  useUpdateUserMutation,
} from "../store/services/userApi";
import { queryError } from "@/lib/api/baseApi";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import {
  assignablePermissions,
  hasPermission,
} from "@/modules/auth/permissions";
import ConfirmDialog from "@/modules/base/components/confirm-dialog";

const permissionDetails: Record<
  string,
  { label: string; description: string; note?: string }
> = {
  "blogs.moderate": {
    label: "Moderate stories",
    description:
      "Review stories, change publication status, and view Admin Trash.",
  },
  "blogs.delete": {
    label: "Delete stories",
    description: "Move eligible stories to Trash.",
  },
  "blogs.restore": {
    label: "Restore stories",
    description: "Recover eligible stories from Admin Trash.",
  },
  "blogs.purge": {
    label: "Permanently delete stories",
    description: "Permanently remove eligible trashed stories.",
    note: "Permanently deleted stories cannot be restored from Trash.",
  },
  "taxonomy.manage": {
    label: "Manage categories & tags",
    description:
      "Manage categories and tags, including editing those created by others.",
  },
  "taxonomy.delete": {
    label: "Delete categories & tags",
    description: "Remove existing categories or tags.",
  },
  "comments.delete": {
    label: "Delete comments",
    description:
      "Remove others’ comments and replies, without editing their content.",
  },
  "faqs.manage": {
    label: "Manage FAQs",
    description: "Grant FAQ management access where supported by the server.",
  },
  "faqs.delete": {
    label: "Delete FAQs",
    description: "Grant FAQ deletion access where supported by the server.",
  },
  "users.manage": {
    label: "Manage users",
    description: "View users and manage eligible accounts’ active status.",
    note: "Account-management limits still apply. This does not grant permission to promote admins or assign access.",
  },
};

const permissionGroups = [
  { title: "Blog Management", prefix: "blogs.", icon: BookOpen },
  { title: "Categories & Tags", prefix: "taxonomy.", icon: Tags },
  { title: "Community", prefix: "comments.", icon: MessageSquare },
  { title: "FAQ Management", prefix: "faqs.", icon: CircleHelp },
  { title: "Administration", prefix: "users.", icon: UsersRound },
];

function roleLabel(role: ManagedUser["role"]) {
  return { author: "Author", admin: "Admin", super_admin: "Super Admin" }[role];
}

function AccessForm({
  account,
  onClose,
}: {
  account: ManagedUser;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [permissions, setPermissions] = useState<string[]>(
    account.role === "author" ? [] : (account.permissions ?? []),
  );
  const [update, { isLoading }] = useUpdateUserMutation();
  const [error, setError] = useState("");
  const additional =
    account.role === "author"
      ? []
      : (account.permissions ?? []).filter(
          (value) => !assignablePermissions.some((option) => option === value),
        );
  const groups = [
    ...permissionGroups.map((group) => ({
      ...group,
      keys: assignablePermissions.filter((key) => key.startsWith(group.prefix)),
    })),
    { title: "Additional permissions", icon: ShieldCheck, keys: additional },
  ];
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog access-dialog"
      aria-label={`Access for ${account.displayName}`}
      aria-describedby="access-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!isLoading) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
          submitting.current = true;
          setError("");
          try {
            await update({
              id: account.id,
              change:
                account.role === "author"
                  ? { role: "admin", permissions }
                  : { permissions },
            }).unwrap();
            toast.success("Account access updated.");
            onClose();
          } catch (error) {
            setError(queryError(error));
          } finally {
            submitting.current = false;
          }
        }}
      >
        <header className="access-header">
          <h2>
            {account.role === "author"
              ? "Promote to admin"
              : "Edit permissions"}
          </h2>
          <p id="access-description">
            Choose what this administrator can manage.
          </p>
          <div className="access-account">
            <span className="managed-avatar" aria-hidden="true">
              {Array.from(account.displayName.trim())[0]?.toLocaleUpperCase() ||
                "U"}
            </span>
            <div>
              <strong>{account.displayName}</strong>
              <span className="user-role-badge">{roleLabel(account.role)}</span>
            </div>
            <span className="selected-permissions" aria-live="polite">
              {permissions.length} selected
            </span>
          </div>
        </header>
        <div className="permission-groups">
          <p className="access-help">
            Select grants below. Clearing all permissions revokes administrative
            access.
          </p>
          {groups
            .filter((group) => group.keys.length > 0)
            .map(({ title, icon: Icon, keys }) => (
              <fieldset
                key={title}
                className="permission-group"
                disabled={isLoading}
              >
                <legend>
                  <Icon size={18} aria-hidden="true" />
                  {title}
                </legend>
                {keys.map((permission) => {
                  const details = permissionDetails[permission];
                  const readOnly = !assignablePermissions.some(
                    (option) => option === permission,
                  );
                  return (
                    <label key={permission} className="permission-option">
                      <input
                        type="checkbox"
                        aria-label={details?.label || permission}
                        aria-describedby={
                          details
                            ? `permission-description-${permission}`
                            : undefined
                        }
                        disabled={readOnly}
                        checked={permissions.includes(permission)}
                        onChange={(event) =>
                          setPermissions((current) =>
                            event.target.checked
                              ? [...current, permission]
                              : current.filter((value) => value !== permission),
                          )
                        }
                      />
                      <span className="permission-copy">
                        <strong>{details?.label || permission}</strong>
                        <span
                          id={
                            details
                              ? `permission-description-${permission}`
                              : undefined
                          }
                        >
                          {details?.description ||
                            "Existing server permission. Kept unchanged when saving."}
                        </span>
                        <code>{permission}</code>
                        {details?.note && (
                          <span className="permission-note">
                            {permission === "blogs.purge" ? (
                              <TriangleAlert size={14} aria-hidden="true" />
                            ) : (
                              <Info size={14} aria-hidden="true" />
                            )}
                            {details.note}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
        </div>
        <footer className="access-footer">
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isLoading}
              autoFocus
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button button-primary" disabled={isLoading}>
              {isLoading ? "Saving…" : "Save access"}
            </button>
          </div>
        </footer>
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
  const {
    currentData: data,
    isFetching,
    error,
    refetch,
  } = useGetUsersQuery({ q: query, page }, { skip: !allowed });
  const [update, { isLoading }] = useUpdateUserMutation();
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [pending, setPending] = useState<ManagedUser | null>(null);
  const [failure, setFailure] = useState("");

  if (data && !isFetching && page > Math.max(1, data.totalPages))
    setPage(Math.max(1, data.totalPages));
  if (!allowed)
    return <p role="alert">You do not have permission to manage users.</p>;

  return (
    <section className="user-management" aria-label="User management">
      <div className="section-heading">
        <h1>User management</h1>
      </div>
      <p className="muted users-description">
        Manage members, roles, permissions, and account access.
      </p>
      {data && (
        <div className="user-summary">
          <UsersRound size={20} aria-hidden="true" />
          <div>
            <span>{query ? "Matching users" : "Total users"}</span>
            <strong>{data.total}</strong>
          </div>
        </div>
      )}
      <form
        className="search-form user-search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(input.trim());
          setPage(1);
          if (query === input.trim() && page === 1) void refetch();
        }}
      >
        <label>
          <span className="sr-only">Search users</span>
          <Search size={18} aria-hidden="true" />
          <input
            className="form-control"
            type="search"
            maxLength={254}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Name or email"
          />
        </label>
        <button className="button button-primary" disabled={isFetching}>
          Search
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setInput("");
            setQuery("");
            setPage(1);
          }}
        >
          Clear
        </button>
      </form>
      {(failure || error) && (
        <p className="notice" role="alert">
          {failure || queryError(error)}{" "}
          <button
            className="text-link"
            onClick={() => {
              setFailure("");
              void refetch();
            }}
          >
            Refresh users
          </button>
        </p>
      )}
      {isFetching ? (
        <p role="status">Loading users…</p>
      ) : (
        !error &&
        data && (
          <>
            <p className="result-count">
              {data.total} {data.total === 1 ? "user" : "users"} · 10 per page
            </p>
            {!data.items.length ? (
              <div className="empty-state">
                <h2>No users found.</h2>
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
                    {data.items.map((account) => {
                      const protectedAccount =
                        account.role === "super_admin" ||
                        hasPermission(account, "users.grant_access");
                      const canChangeStatus =
                        !protectedAccount &&
                        account.id !== user?.id &&
                        (account.role === "author" ||
                          user?.role === "super_admin");
                      return (
                        <tr key={account.id}>
                          <th scope="row">
                            <div className="managed-user-identity">
                              <span
                                className="managed-avatar"
                                aria-hidden="true"
                              >
                                {Array.from(
                                  account.displayName.trim(),
                                )[0]?.toLocaleUpperCase() || "U"}
                              </span>
                              <div>
                                <span className="user-name">
                                  {account.displayName}
                                  {account.id === user?.id && (
                                    <span className="user-self"> (You)</span>
                                  )}
                                </span>
                                <span className="user-email">
                                  {account.email}
                                </span>
                              </div>
                            </div>
                          </th>
                          <td data-label="Registered">
                            {dateLabel(account.createdAt)}
                          </td>
                          <td data-label="Role">
                            <span className="user-role-badge">
                              {roleLabel(account.role)}
                            </span>
                          </td>
                          <td data-label="Status">
                            <span
                              className="user-status-badge"
                              data-active={account.status === "active"}
                            >
                              <span aria-hidden="true" />
                              {account.status === "active"
                                ? "Active"
                                : "Deactivated"}
                            </span>
                          </td>
                          <td data-label="Account access">
                            <div className="actions">
                              {canGrant && !protectedAccount && (
                                <button
                                  className="button button-secondary"
                                  disabled={isLoading}
                                  onClick={() => setEditing(account)}
                                >
                                  <ShieldCheck size={16} aria-hidden="true" />
                                  {account.role === "author"
                                    ? "Promote to admin"
                                    : "Edit permissions"}
                                </button>
                              )}
                              {canChangeStatus && (
                                <button
                                  className="button button-secondary"
                                  data-disabling={account.status === "active"}
                                  disabled={isLoading}
                                  onClick={() => setPending(account)}
                                >
                                  <Power size={16} aria-hidden="true" />
                                  {account.status === "active"
                                    ? "Deactivate"
                                    : "Reactivate"}
                                </button>
                              )}
                              {protectedAccount && (
                                <span className="protected-account">
                                  <ShieldCheck size={15} aria-hidden="true" />
                                  Protected account
                                </span>
                              )}
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
              <button
                disabled={page <= 1 || isLoading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, data.totalPages)}
              </span>
              <button
                disabled={page >= data.totalPages || isLoading}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )
      )}
      {canGrant && editing && (
        <AccessForm
          key={editing.id}
          account={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {pending && (
        <ConfirmDialog
          title={
            pending.status === "active"
              ? "Deactivate account?"
              : "Reactivate account?"
          }
          message={
            pending.status === "active"
              ? `${pending.displayName} will be signed out. Their stories will be preserved.`
              : `${pending.displayName} will be able to sign in again.`
          }
          confirmLabel="Save changes"
          busyLabel="Saving…"
          busy={isLoading}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            if (isLoading) return;
            try {
              await update({
                id: pending.id,
                change: {
                  status: pending.status === "active" ? "disabled" : "active",
                },
              }).unwrap();
              toast.success("Account updated.");
            } catch (error) {
              setFailure(queryError(error));
            } finally {
              setPending(null);
            }
          }}
        />
      )}
    </section>
  );
}
