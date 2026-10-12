// Isolated contract fixture. It never connects to the real backend or database.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
let requestLog = [], failRequest = null;
let categories, tags, blogs, users, sessions, access, failSave, images, passwords, resetCodes;
const now = "2026-10-07T00:00:00.000Z";
function reset() {
  users = [
    {
      id: "author",
      displayName: "Alex Writer",
      email: "author@test.local",
      role: "author",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "other",
      displayName: "Other Writer",
      email: "other@test.local",
      role: "author",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "admin",
      displayName: "Sam Editor",
      email: "admin@test.local",
      role: "admin",
      createdAt: now,
      updatedAt: now,
    },
  ];
  users.push(...Array.from({ length: 12 }, (_, index) => ({
    id: `member-${index}`, displayName: `Member ${index + 1}`, email: `member${index + 1}@test.local`, role: "author", createdAt: now, updatedAt: now,
  })));
  for (const account of users) account.status = "active";
  categories = [
    {
      id: "cat-1",
      name: "Ideas",
      slug: "ideas",
      createdById: "author",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "cat-2",
      name: "Life",
      slug: "life",
      createdById: "other",
      createdAt: now,
      updatedAt: now,
    },
  ];
  tags = [
    {
      id: "tag-1",
      name: "Thinking",
      slug: "thinking",
      categoryId: "cat-1",
      createdById: "author",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tag-2",
      name: "Perspective",
      slug: "perspective",
      categoryId: "cat-1",
      createdById: "other",
      createdAt: now,
      updatedAt: now,
    },
  ];
  blogs = Array.from({ length: 12 }, (_, index) => ({
    id: `story-${index + 1}`,
    title: `Thoughtful story ${index + 1}`,
    slug: `thoughtful-story-${index + 1}`,
    content:
      '## A fresh perspective\n\n**A good idea** starts with a question.\n\n<script>alert("bad")</script>',
    author: users[index % 2 ? 1 : 0],
    categoryId: "cat-1",
    tagIds: ["tag-1"],
    coverImageUrl: null,
    status: "published",
    publicationBlocked: false,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  }));
  blogs.push({
    ...blogs[0],
    id: "draft-1",
    slug: "draft-one",
    title: "Private draft",
    status: "draft",
    content: "Untouched __Markdown__",
    publishedAt: null,
  });
  blogs.push({
    ...blogs[0],
    id: "uncategorized",
    slug: "uncategorized-story",
    title: "Uncategorized draft",
    status: "draft",
    categoryId: null,
    tagIds: [],
    publishedAt: null,
  });
  passwords = new Map();
  resetCodes = new Map();
  sessions = new Map();
  access = new Map();
  failSave = false;
  images = new Map();
}
reset();
function serialize(blog, detail) {
  const category =
    categories.find((item) => item.id === blog.categoryId) || null;
  const result = {
    ...blog,
    author: { id: blog.author.id, displayName: blog.author.displayName },
    category,
    categoryName: category?.name || "Uncategorized",
    tags: tags.filter((tag) => blog.tagIds.includes(tag.id)),
  };
  delete result.tagIds;
  if (!detail) {
    result.excerpt = blog.content.slice(0, 200);
    delete result.content;
  }
  return result;
}
createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, "http://localhost:5301");
  const path = url.pathname.replace("/api/v1", "");
  if (req.method === "GET" && images.has(path)) {
    const image = images.get(path);
    res.writeHead(200, { "Content-Type": image.type });
    return res.end(image.buffer);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  let data = {}, image;
  if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
    const form = await new Request(url, {
      method: req.method,
      headers: { "Content-Type": req.headers["content-type"] },
      body,
    }).formData();
    image = form.get("image");
    for (const [key, value] of form) {
      if (key !== "image") {
        data[key] = key === "tagIds" ? JSON.parse(value) : key === "coverImageUrl" && value === "null" ? null : value;
      }
    }
  } else if (body.length) data = JSON.parse(body.toString());
  const send = (value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(status === 204 ? undefined : JSON.stringify(value));
  };
  if (path === "/__requests") return send(requestLog);
  if (path === "/__fail-request") {
    failRequest = data;
    return send({ ok: true });
  }
  if (!path.startsWith("/__")) requestLog.push({ path: url.pathname + url.search, method: req.method, contentType: req.headers["content-type"] });
  if (failRequest?.path === path && failRequest.method === req.method) {
    const failure = failRequest;
    failRequest = null;
    return send({ message: failure.message }, failure.status);
  }
  if (path === "/__reset") {
    requestLog = [];
    failRequest = null;
    reset();
    return send({ ok: true });
  }
  if (path === "/__fail-save") {
    failSave = true;
    return send({ ok: true });
  }
  if (path === "/__expire-access") {
    access.clear();
    return send({ ok: true });
  }
  if (path === "/auth/register") {
    if (users.some((user) => user.email === data.email))
      return send({ message: "Email already exists" }, 409);
    users.push({
      id: randomUUID(),
      displayName: data.displayName,
      email: data.email,
      role: "author",
      createdAt: now,
      updatedAt: now,
    });
    return send({ message: "Registered" }, 201);
  }
  if (path === "/auth/forgot-password") {
    if (users.some((user) => user.email === data.email)) resetCodes.set(data.email, "012345");
    return send({ message: "If this email is registered, a password reset code has been sent." });
  }
  if (path === "/auth/reset-password") {
    if (!resetCodes.has(data.email) || resetCodes.get(data.email) !== data.code)
      return send({ message: "Invalid or expired reset code" }, 400);
    passwords.set(data.email, data.newPassword);
    resetCodes.delete(data.email);
    for (const [key, value] of sessions) if (value.email === data.email) sessions.delete(key);
    for (const [key, value] of access) if (value.email === data.email) access.delete(key);
    return send({ message: "Password reset successfully. Please log in again." });
  }
  const cookie = /bloghub_refresh=([^;]+)/.exec(req.headers.cookie || "")?.[1];
  if (path === "/auth/logout") {
    sessions.delete(cookie);
    res.setHeader(
      "Set-Cookie",
      "bloghub_refresh=; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    return send(undefined, 204);
  }
  if (path === "/auth/login" || path === "/auth/refresh") {
    const user = path.endsWith("login")
      ? users.find((user) => user.email === data.email)
      : sessions.get(cookie);
    if (!user || user.status === "disabled" || (path.endsWith("login") && data.password !== (passwords.get(user.email) || "password123"))) return send({ message: "Sign in required" }, 401);
    sessions.delete(cookie);
    const refresh = randomUUID();
    const token = randomUUID();
    sessions.set(refresh, user);
    access.set(token, user);
    res.setHeader(
      "Set-Cookie",
      `bloghub_refresh=${refresh}; Path=/api/v1/auth; HttpOnly; SameSite=Lax`,
    );
    return send({ accessToken: token, expiresIn: 3600 });
  }
  const user = access.get(
    (req.headers.authorization || "").replace("Bearer ", ""),
  );
  if (path === "/auth/me")
    return user ? send(user) : send({ message: "Sign in required" }, 401);
  if (path === "/auth/change-password") {
    if (!user) return send({ message: "Sign in required" }, 401);
    if (data.currentPassword !== (passwords.get(user.email) || "password123"))
      return send({ message: "Current password is incorrect" }, 401);
    passwords.set(user.email, data.newPassword);
    for (const [key, value] of sessions) if (value.id === user.id) sessions.delete(key);
    for (const [key, value] of access) if (value.id === user.id) access.delete(key);
    return send({ message: "Password changed successfully. Please log in again." });
  }
  const protectedPath =
    path.startsWith("/me/") ||
    path.startsWith("/admin/") ||
    req.method !== "GET";
  if (protectedPath && !user) return send({ message: "Sign in required" }, 401);
  if (path.startsWith("/admin/") && user.role !== "admin")
    return send({ message: "Admin required" }, 403);
  const adminStatus = /^\/admin\/blogs\/([^/]+)\/status$/.exec(path);
  if (adminStatus && req.method === "PATCH") {
    const blog = blogs.find((item) => item.id === adminStatus[1]);
    if (!blog) return send({ message: "Story not found" }, 404);
    if (!["draft", "published"].includes(data.status) || Object.keys(data).some((key) => key !== "status"))
      return send({ message: "Invalid status update" }, 400);
    blog.status = data.status;
    blog.publicationBlocked = data.status === "draft";
    if (data.status === "published" && !blog.publishedAt) blog.publishedAt = now;
    blog.updatedAt = new Date().toISOString();
    return send(serialize(blog, true));
  }
  if (path === "/admin/users" && req.method === "GET") {
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const page = Number(url.searchParams.get("page") || 1);
    const limit = Number(url.searchParams.get("limit") || 10);
    const filtered = users.filter((account) => `${account.displayName} ${account.email}`.toLowerCase().includes(q));
    return send({ items: filtered.slice((page - 1) * limit, page * limit), page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) });
  }
  const userUpdate = /^\/admin\/users\/([^/]+)\/(role|status)$/.exec(path);
  if (userUpdate && req.method === "PATCH") {
    const target = users.find((account) => account.id === userUpdate[1]);
    if (!target) return send({ message: "User not found" }, 404);
    if (target.id === user.id && data.status === "disabled") return send({ message: "You cannot deactivate your own account" }, 403);
    if (target.role === "admin" && target.status === "active" && (data.role === "author" || data.status === "disabled") && users.filter((account) => account.role === "admin" && account.status === "active").length <= 1)
      return send({ message: "The last active admin must remain active and keep the admin role" }, 409);
    if (data.role) target.role = data.role;
    if (data.status) target.status = data.status;
    if (target.status === "disabled") {
      for (const [key, account] of sessions) if (account.id === target.id) sessions.delete(key);
      for (const [key, account] of access) if (account.id === target.id) access.delete(key);
    }
    return send(target);
  }
  if (image) {
    if (data.coverImageUrl !== undefined) return send({ message: "Send either image or coverImageUrl, not both" }, 400);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) return send({ message: "Image must be JPEG, PNG, or WebP" }, 400);
    if (image.size > 5 * 1024 * 1024) return send({ message: "Image must be at most 5 MB" }, 413);
    const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1];
    data.coverImageUrl = `/images/${randomUUID()}.${extension}`;
    images.set(data.coverImageUrl, { type: image.type, buffer: Buffer.from(await image.arrayBuffer()) });
  }
  const kind = /^\/(categories|tags)/.exec(path)?.[1];
  if (kind) {
    const items = kind === "categories" ? categories : tags;
    const id = path.split("/")[2];
    if (req.method === "GET") return send(items);
    const item = items.find((item) => item.id === id);
    if (id && !item) return send({ message: "Not found" }, 404);
    if (
      id &&
      user.role !== "admin" &&
      (req.method === "DELETE" || item.createdById !== user.id)
    )
      return send({ message: "Forbidden" }, 403);
    if (req.method === "POST") {
      if (
        items.some(
          (item) =>
            item.name.toLowerCase() === data.name.toLowerCase() &&
            (kind === "categories" || item.categoryId === data.categoryId),
        )
      )
        return send({ message: "Name already exists" }, 409);
      const created = {
        ...data,
        id: randomUUID(),
        slug: data.name.toLowerCase().replaceAll(" ", "-"),
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      };
      items.push(created);
      return send(created, 201);
    }
    if (req.method === "PATCH") {
      item.name = data.name;
      item.slug = data.name.toLowerCase().replaceAll(" ", "-");
      return send(item);
    }
    if (req.method === "DELETE") {
      if (kind === "categories") {
        categories = categories.filter((value) => value.id !== id);
        tags = tags.filter((value) => value.categoryId !== id);
        blogs.forEach((blog) => {
          if (blog.categoryId === id) {
            blog.categoryId = null;
            blog.tagIds = [];
          }
        });
      } else {
        tags = tags.filter((value) => value.id !== id);
        blogs.forEach((blog) => {
          blog.tagIds = blog.tagIds.filter((value) => value !== id);
        });
      }
      return send(undefined, 204);
    }
  }
  if (
    ["/blogs", "/me/blogs", "/admin/blogs"].includes(path) &&
    req.method === "GET"
  ) {
    const q = url.searchParams;
    let items = blogs.filter((blog) =>
      path === "/blogs"
        ? blog.status === "published"
        : path === "/me/blogs"
          ? blog.author.id === user.id
          : true,
    );
    for (const key of ["status", "q", "author", "category", "tag"])
      if (q.get(key))
        items = items.filter((blog) =>
          key === "status"
            ? blog.status === q.get(key)
            : key === "q"
              ? (blog.title + blog.content)
                  .toLowerCase()
                  .includes(q.get(key).toLowerCase())
              : key === "author"
                ? blog.author.displayName
                    .toLowerCase()
                    .includes(q.get(key).toLowerCase())
                : key === "category"
                  ? categories.find(
                      (category) => category.id === blog.categoryId,
                    )?.slug === q.get(key)
                  : tags.some(
                      (tag) =>
                        blog.tagIds.includes(tag.id) && tag.slug === q.get(key),
                    ),
        );
    const page = Number(q.get("page") || 1),
      limit = Number(q.get("limit") || 10);
    return send({
      items: items
        .slice((page - 1) * limit, page * limit)
        .map((blog) => serialize(blog, false)),
      page,
      limit,
      total: items.length,
      totalPages: Math.ceil(items.length / limit),
    });
  }
  if (path === "/blogs" && req.method === "POST") {
    if (failSave) {
      failSave = false;
      return send({ message: "Temporary save failure" }, 503);
    }
    const blog = {
      coverImageUrl: null,
      ...data,
      id: randomUUID(),
      slug: data.title.toLowerCase().replaceAll(" ", "-"),
      author: user,
      publishedAt: data.status === "published" ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    blogs.unshift(blog);
    return send(serialize(blog, true), 201);
  }
  const match = /^\/(blogs|me\/blogs|admin\/blogs)\/([^/]+)$/.exec(path);
  if (match) {
    const blog = blogs.find((blog) =>
      req.method === "GET" && match[1] === "blogs"
        ? blog.slug === decodeURIComponent(match[2]) &&
          blog.status === "published"
        : blog.id === match[2],
    );
    if (!blog) return send({ message: "Story not found" }, 404);
    if (match[1] !== "blogs" || req.method !== "GET")
      if (user.role !== "admin" && blog.author.id !== user.id)
        return send({ message: "Forbidden" }, 403);
    if (req.method === "GET") return send(serialize(blog, true));
    if (req.method === "DELETE") {
      blogs = blogs.filter((value) => value.id !== blog.id);
      return send(undefined, 204);
    }
    if (req.method === "PATCH") {
      if (blog.author.id !== user.id) return send({ message: "Forbidden" }, 403);
      if (blog.publicationBlocked && data.status === "published")
        return send({ message: "Only an admin can publish this story again" }, 403);
      if (failSave) {
        failSave = false;
        return send({ message: "Temporary save failure" }, 503);
      }
      Object.assign(blog, data);
      if (data.status === "published" && !blog.publishedAt)
        blog.publishedAt = now;
      blog.updatedAt = new Date().toISOString();
      return send(serialize(blog, true));
    }
  }
  send({ message: "Not found" }, 404);
}).listen(5301);
