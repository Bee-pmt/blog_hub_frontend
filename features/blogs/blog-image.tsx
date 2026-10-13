"use client";

import { useState } from "react";
import { blogImageUrl } from "@/lib/api";

type BlogImageProps = {
  src: string;
  alt?: string;
  className?: string;
};

export default function BlogImage({
  src,
  alt = "",
  className = "",
}: BlogImageProps) {
  const [failedSrc, setFailedSrc] = useState("");
  const imageUrl = blogImageUrl(src);
  if (!imageUrl || failedSrc === imageUrl)
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
      src={imageUrl}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(imageUrl)}
    />
  );
}
