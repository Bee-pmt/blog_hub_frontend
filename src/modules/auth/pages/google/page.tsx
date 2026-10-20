import Link from "next/link";
import type { ModulePageProps } from "@/moduleTypes";
import { errorMessage } from "@/lib/api-client";
import { prepareGoogleAction } from "../../google-actions";
import GoogleForm from "../../components/google-form";
import GoogleButton from "../../components/google-button";

export default async function GooglePage({ searchParams }: ModulePageProps) {
  let pending;
  try {
    const oauthError = (await searchParams).error;
    if (oauthError)
      throw new Error(
        oauthError === "Configuration"
          ? "Google sign-in could not be completed by the server. Please try email and password while this is resolved."
          : oauthError === "AccessDenied"
            ? "Google sign-in was not allowed. Choose an account with a verified Google email and approve sign-in."
            : "Google sign-in could not be completed. Please start again using the button below.",
      );
    pending = await prepareGoogleAction();
  } catch (failure) {
    return (
      <main id="main-content" className="site-container account-page">
        <div className="card account-card">
          <h1>Unable to continue with Google</h1>
          <p className="notice" role="alert">
            {errorMessage(failure)}
          </p>
          <GoogleButton />
          <Link className="text-link" href="/login">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }
  return <GoogleForm {...pending} />;
}
