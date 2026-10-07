import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-container footer-inner">
        <Link className="wordmark footer-wordmark" href="/">
          BlogHub.
        </Link>
        <p>Ideas find a home here.</p>
        <a className="text-link" href="#main-content">
          Back to top <span aria-hidden="true">↑</span>
        </a>
      </div>
    </footer>
  );
}
