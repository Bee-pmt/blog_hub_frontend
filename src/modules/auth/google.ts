import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getToken } from "next-auth/jwt";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { ApiError } from "@/lib/api-client";

// This short-lived cookie carries OAuth proof only. NestJS owns the app session.
const cookieName = "bloghub_google";
export const { handlers, signIn } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: { scope: "openid email profile", prompt: "select_account" },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 600 },
  cookies: {
    sessionToken: {
      name: cookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: { signIn: "/login", error: "/auth/google" },
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider === "google" && profile?.email_verified === true;
    },
    jwt({ token, account }) {
      if (account?.provider === "google") {
        token.googleIdToken = account.id_token;
        token.googleExpiresAt = Date.now() + 600_000;
      }
      return token;
    },
    session({ session }) {
      // Never return the Google ID token or application refresh token to JS.
      return { expires: session.expires, user: undefined };
    },
  },
});

export async function readGoogleHandoff() {
  if (!process.env.AUTH_SECRET)
    throw new ApiError("Google login is not configured.", 503);
  // Token expiry checks use the clock and must run on a real request.
  await connection();
  const token = await getToken({
    req: { headers: await headers() },
    secret: process.env.AUTH_SECRET,
    cookieName,
    salt: cookieName,
  });
  if (
    typeof token?.googleIdToken !== "string" ||
    typeof token.googleExpiresAt !== "number" ||
    token.googleExpiresAt <= Date.now()
  )
    throw new ApiError(
      "Your Google sign-in expired. Please continue with Google again.",
      401,
    );
  return token.googleIdToken;
}

export async function clearGoogleHandoff() {
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name === cookieName || cookie.name.startsWith(`${cookieName}.`))
      store.delete(cookie.name);
  }
  store.delete("bloghub_oauth_intent");
}
