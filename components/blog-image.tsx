"use client";

import { useState } from "react";
import { httpUrl } from "@/lib/api";

export default function BlogImage({
  src,
  alt = "",
  className = "",
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  if (!httpUrl(src) || failedSrc === src)
    return (
      <span
        className={`image-fallback ${className}`}
        role="img"
        aria-label={alt || "Image unavailable"}
      >
        Image unavailable
      </span>
    );
  // External image URLs load directly in the browser, without a server image proxy.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}
