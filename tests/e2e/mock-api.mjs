// Isolated contract fixture. It never connects to the real backend or database.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
let categories, tags, blogs, users, sessions, access, failSave;
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
  sessions = new Map();
  access = new Map();
  failSave = false;
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
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = body ? JSON.parse(body) : {};
  const send = (value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(status === 204 ? undefined : JSON.stringify(value));
  };
  if (path === "/__reset") {
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
    if (!user) return send({ message: "Sign in required" }, 401);
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
  const protectedPath =
    path.startsWith("/me/") ||
    path.startsWith("/admin/") ||
    req.method !== "GET";
  if (protectedPath && !user) return send({ message: "Sign in required" }, 401);
  if (path.startsWith("/admin/") && user.role !== "admin")
    return send({ message: "Admin required" }, 403);
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
