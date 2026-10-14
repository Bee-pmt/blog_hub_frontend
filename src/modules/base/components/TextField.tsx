import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string };
export default function TextField({
  label,
  className = "form-control",
  ...input
}: Props) {
  return (
    <label>
      {label}
      <input className={className} {...input} />
    </label>
  );
}
