# Coding Rules

Keep the code simple, readable, and beginner-friendly.

Do not over-engineer solutions.

Do not add extra abstractions, helper functions, custom hooks, utility files, wrappers, interfaces, types, libraries, or components unless they are actually necessary.

Do not write complex code when a simple solution works.

Do not add features that I did not ask for.

Do not refactor unrelated code unless it is required to complete the task.

Before creating a new file, check whether an existing file can handle the change cleanly.

Use clear variable names and straightforward logic.

Prefer fewer files and less code when both approaches are equally good.

# Next.js Rules

Use Next.js App Router.

Prefer Server Components by default.

Only use `"use client"` when client-side state, browser APIs, event handlers, or client hooks are actually required.

Prefer Server Actions for form mutations when appropriate.

Keep data fetching close to the server.

Do not create unnecessary API routes if a Server Action or Server Component can solve the problem.

# Folder Structure

Use this structure when appropriate:

src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── feature/
│       └── page.tsx
├── components/
│   ├── ui/
│   └── shared/
├── actions/
├── lib/
├── types/
└── utils/

Only create folders when they are actually needed.

Do not create empty folders.

Do not create a separate file for very small logic unless reuse or maintainability requires it.

# Component Rules

Keep components small but do not split them unnecessarily.

Create a separate component when:
- it is reused
- it has meaningful independent responsibility
- the parent component is becoming difficult to read

Do not create components for tiny one-use JSX blocks unless there is a clear benefit.

# TypeScript Rules

Use TypeScript.

Avoid `any` unless there is no reasonable alternative.

Keep types simple.

Do not create complicated generic types unless required.

Do not create duplicate types if TypeScript can infer them safely.

# Implementation Style

When I ask for a feature:

1. First inspect the existing project structure.
2. Reuse existing code where possible.
3. Make the smallest necessary change.
4. Do not change unrelated files.
5. Avoid unnecessary dependencies.
6. Explain briefly what files you changed.
7. Keep the solution production-appropriate but simple.

If there are multiple ways to solve something, choose the simplest maintainable approach.