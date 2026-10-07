import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BlogImage from "./blog-image";
import { httpUrl } from "@/lib/api";

export function safeMarkdownUrl(url: string) {
  if (httpUrl(url) || /^mailto:[^\s]+$/i.test(url) || /^(\/[^/\\]|#)/.test(url))
    return url;
  return "";
}

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={safeMarkdownUrl}
        components={{
          img: ({ src, alt }) =>
            typeof src === "string" ? (
              <BlogImage src={src} alt={alt || ""} />
            ) : null,
          a: ({ href, children }) =>
            href ? (
              <a href={href} rel="nofollow noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
