"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useForm, useWatch } from "react-hook-form";
import { LoaderCircle, Send } from "lucide-react";
import TextField from "@/modules/base/components/TextField";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { API_BASE, apiWrapper } from "@/lib/api-client";

type ContactFields = { name: string; email: string; subject: string; message: string };
type CaptchaApi = {
  render: (element: HTMLElement, options: {
    sitekey: string; theme: "light" | "dark"; size: "compact";
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => number;
  reset: (id: number) => void;
};

declare global {
  interface Window {
    grecaptcha?: CaptchaApi;
    bloghubContactCaptchaReady?: () => void;
  }
}

const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
const fields = [
  { name: "name", label: "Name", type: "text", min: 2, max: 100, placeholder: "Your name", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", min: 1, max: 254, placeholder: "you@example.com", autoComplete: "email" },
  { name: "subject", label: "Subject", type: "text", min: 3, max: 150, placeholder: "What would you like to discuss?", autoComplete: "off" },
] as const;

export default function Contact() {
  const { user } = useAuth();
  const accountName = user?.displayName;
  const accountEmail = user?.email;
  const { register, handleSubmit, control, getValues, getFieldState, setValue, setError: setFieldError, reset, formState: { errors } } = useForm<ContactFields>({
    defaultValues: { name: "", email: "", subject: "", message: "" },
  });
  const message = useWatch({ control, name: "message" });
  const [token, setToken] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);
  const [captchaError, setCaptchaError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  const pending = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<number | null>(null);
  const currentTheme = useRef(theme);
  const waiting = Math.max(0, Math.ceil((retryAt - now) / 1000));

  useEffect(() => {
    if (!accountName || !accountEmail) return;
    if (!getFieldState("name").isDirty && !getValues("name")) setValue("name", accountName);
    if (!getFieldState("email").isDirty && !getValues("email")) setValue("email", accountEmail);
  }, [accountName, accountEmail, getValues, getFieldState, setValue]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      const selected = document.documentElement.dataset.theme;
      const next = selected === "dark" || (selected === "system" && media.matches) ? "dark" : "light";
      if (next !== currentTheme.current) {
        currentTheme.current = next;
        setToken("");
        setTheme(next);
      }
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    media.addEventListener("change", updateTheme);
    const ready = () => { setCaptchaReady(true); setCaptchaError(""); };
    window.bloghubContactCaptchaReady = ready;
    const timeout = window.setTimeout(() => {
      if (typeof window.grecaptcha?.render !== "function") setCaptchaError("Verification could not load. Check your connection and reload this page.");
    }, 15000);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", updateTheme);
      window.clearTimeout(timeout);
      if (window.bloghubContactCaptchaReady === ready) delete window.bloghubContactCaptchaReady;
    };
  }, []);

  useEffect(() => {
    const api = window.grecaptcha;
    if (!captchaReady || !siteKey || !container.current || !api) return;
    let active = true;
    const element = document.createElement("div");
    container.current.appendChild(element);
    const frame = window.requestAnimationFrame(() => {
      if (!active) return;
      try {
        widget.current = api.render(element, {
          sitekey: siteKey, theme, size: "compact",
          callback: value => { if (active) { setToken(value); setCaptchaError(""); } },
          "expired-callback": () => { if (active) { setToken(""); setCaptchaError("Verification expired. Please complete the CAPTCHA again."); } },
          "error-callback": () => { if (active) { setToken(""); setCaptchaError("Verification is unavailable. Check your connection and try again."); } },
        });
      } catch {
        setCaptchaError("Verification could not load. Please reload this page and try again.");
      }
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      if (widget.current !== null) api.reset(widget.current);
      widget.current = null;
      element.remove();
    };
  }, [captchaReady, theme]);

  useEffect(() => {
    if (retryAt <= now) return;
    const timeout = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timeout);
  }, [retryAt, now]);

  async function submit(values: ContactFields) {
    if (pending.current || retryAt > Date.now() || !siteKey) return;
    setSuccess(false);
    setError("");
    if (!token) {
      setCaptchaError(current => current || "Please complete the CAPTCHA verification.");
      return;
    }
    pending.current = true;
    setSending(true);
    let retryAfter: string | null = null;
    try {
      const result = await apiWrapper<{ message: string }>({
        endpoint: `${API_BASE}/contact`, method: "POST", credentials: "omit",
        body: { name: values.name.trim(), email: values.email.trim(), subject: values.subject.trim(), message: values.message.trim(), captchaToken: token },
        onResponse: response => { retryAfter = response.headers.get("Retry-After"); },
      });
      if (result.ok) {
        reset({ name: "", email: "", subject: "", message: "" });
        setSuccess(true);
      } else if (result.status === 429) {
        setError("Too many requests. Please try again later.");
        const time = Date.now();
        const value = String(retryAfter ?? "").trim();
        const until = /^\d+$/.test(value) ? time + Number(value) * 1000 : Date.parse(value);
        if (Number.isFinite(until) && until > time) { setNow(time); setRetryAt(until); }
      } else if (result.status === 400 && /captcha|verification/i.test(result.data.error)) {
        setCaptchaError("CAPTCHA verification failed. Please complete the verification again.");
      } else if (result.status === 400) {
        const field = (["name", "email", "subject", "message"] as const).find(key => new RegExp(`\\b${key}\\b`, "i").test(result.data.error));
        if (field) setFieldError(field, { type: "server", message: `Please check your ${field}.` });
        setError("Please check your form details and complete the CAPTCHA again.");
      } else {
        setError("We couldn't send your message right now. Please try again later.");
      }
    } catch {
      setError("We couldn't send your message right now. Please try again later.");
    } finally {
      // A failed or timed-out request may already have consumed this token.
      setToken("");
      if (widget.current !== null) window.grecaptcha?.reset(widget.current);
      pending.current = false;
      setSending(false);
    }
  }

  return (
    <main id="main-content" className="site-container contact-page">
      {siteKey && <Script id="bloghub-contact-recaptcha" src="https://www.google.com/recaptcha/api.js?onload=bloghubContactCaptchaReady&render=explicit" strategy="afterInteractive"
        onReady={() => { if (typeof window.grecaptcha?.render === "function") { setCaptchaReady(true); setCaptchaError(""); } }}
        onError={() => { setToken(""); setCaptchaError("Verification could not load. Check your connection and reload this page."); }} />}
      <section className="contact-intro">
        <p className="eyebrow">Contact BlogHub</p>
        <h1>Get in touch.</h1>
        <p>Have a question, feedback, or an issue? We&apos;d love to hear from you.</p>
        <p className="muted">Fill out the form and send your message to the BlogHub team.</p>
      </section>
      <form className="contact-form stack" noValidate onSubmit={event => { void handleSubmit(submit)(event); }} aria-label="Contact us" aria-busy={sending}>
        <fieldset disabled={sending} className="stack">
          <legend className="sr-only">Your contact details and message</legend>
          {fields.map(field => <div key={field.name}>
            <TextField label={`${field.label} (required)`} type={field.type} autoComplete={field.autoComplete} placeholder={field.placeholder} required maxLength={field.max}
              aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `contact-${field.name}-error` : undefined}
              {...register(field.name, { validate: value => {
                const text = value.trim();
                if (!text) return field.name === "email" ? "Enter a valid email address." : `Please enter your ${field.name}.`;
                if (field.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "Enter a valid email address.";
                return text.length >= field.min && text.length <= field.max || `${field.label} must contain ${field.min}–${field.max} characters.`;
              } })} />
            {errors[field.name] && <p className="contact-field-error" id={`contact-${field.name}-error`} role="alert">{errors[field.name]?.message}</p>}
          </div>)}
          <div>
            <label>Message (required)
              <textarea className="form-control" rows={6} required maxLength={2000} placeholder="Tell us how we can help…" aria-invalid={!!errors.message} aria-describedby={`contact-message-count${errors.message ? " contact-message-error" : ""}`}
                {...register("message", { validate: value => value.trim().length >= 10 && value.trim().length <= 2000 || "Message must contain 10–2000 characters." })} />
            </label>
            <p className="field-help contact-counter" id="contact-message-count" aria-live="polite">{message.length}/2000 characters</p>
            {errors.message && <p className="contact-field-error" id="contact-message-error" role="alert">{errors.message.message}</p>}
          </div>
          <div className="contact-verification" role="group" aria-labelledby="contact-verification-label" aria-describedby="contact-captcha-help">
            <p id="contact-verification-label">Verification (required)</p>
            <div ref={container} />
            {!siteKey ? <p className="notice" role="alert">Contact form is temporarily unavailable. Please try again later.</p>
              : captchaError ? <p className="contact-field-error" role="alert">{captchaError}</p>
              : !captchaReady && <p className="field-help" role="status">Loading verification…</p>}
            <p className="field-help" id="contact-captcha-help">Complete the checkbox verification before sending.</p>
          </div>
          <button className="button button-primary contact-submit" disabled={sending || waiting > 0 || !siteKey}>
            {sending ? <LoaderCircle size={18} className="contact-spinner" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}{sending ? "Sending…" : "Send message"}
          </button>
        </fieldset>
        {waiting > 0 && <p className="field-help" role="status">Please wait {waiting} seconds before trying again.</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        {success && <p className="contact-success" role="status">Your message has been sent successfully. Thank you for contacting BlogHub!</p>}
      </form>
    </main>
  );
}
