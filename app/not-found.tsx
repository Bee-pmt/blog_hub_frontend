import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="site-container empty-state">
      <p className="eyebrow">404</p>
      <h1>This page isn’t here.</h1>
      <p>
        The story may be unpublished, removed, or the address may have changed.
      </p>
      <Link className="button button-primary" href="/">
        Return to the journal
      </Link>
    </main>
  );
}
