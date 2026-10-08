import Link from "next/link";
import ThemeSelect from "@/app/theme-select";
import { AccountNav } from "./auth-provider";

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-container header-inner">
        <Link className="wordmark" href="/" aria-label="BlogHub home">
          BlogHub<span aria-hidden="true">.</span>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <Link href="/#journal">Journal</Link>
          <Link href="/#about">About</Link>
          <AccountNav />
          <ThemeSelect />
        </nav>
      </div>
    </header>
  );
}
