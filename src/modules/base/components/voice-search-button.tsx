"use client";

import { useEffect, useId, useRef, useState } from "react";

// Browser speech recognition is not included in TypeScript's standard DOM types.
type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

type VoiceSearchButtonProps = {
  onResult: (text: string) => void;
  language?: string;
  className?: string;
};

export default function VoiceSearchButton({
  onResult,
  language = "en-US",
  className = "inline-flex h-12 w-12 items-center justify-center rounded-lg border border-current bg-transparent focus-visible:outline focus-visible:outline-offset-2",
}: VoiceSearchButtonProps) {
  const statusId = useId();
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const recognition = useRef<VoiceRecognition | null>(null);

  useEffect(
    () => () => {
      const current = recognition.current;
      if (!current) return;
      recognition.current = null;
      setListening(false);
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      current.abort();
    },
    [],
  );

  function startVoiceSearch() {
    if (recognition.current) {
      recognition.current.abort();
      return;
    }
    setVoiceMessage("");
    const browser = window as Window & {
      SpeechRecognition?: new () => VoiceRecognition;
      webkitSpeechRecognition?: new () => VoiceRecognition;
    };
    const SpeechRecognition =
      browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage(
        "Voice search is not supported in this browser. Please type your search.",
      );
      return;
    }

    try {
      const current = new SpeechRecognition();
      recognition.current = current;
      current.lang = language;
      current.continuous = false;
      current.interimResults = false;
      current.onresult = (event) => {
        const text = event.results[0]?.[0]?.transcript.trim();
        if (!text) {
          setVoiceMessage("No speech detected. Please try again.");
          return;
        }
        onResult(text);
      };
      current.onerror = (event) => {
        setListening(false);
        const messages: Record<string, string> = {
          "not-allowed":
            "Allow microphone access to use voice search, or type your search.",
          "service-not-allowed":
            "Allow microphone access to use voice search, or type your search.",
          "audio-capture":
            "No microphone is available. Please type your search.",
          "no-speech": "No speech detected. Please try again.",
          aborted: "Voice search cancelled.",
        };
        setVoiceMessage(
          messages[event.error] ||
            "Voice search failed. Please try again or type your search.",
        );
      };
      current.onend = () => {
        recognition.current = null;
        setListening(false);
      };
      setListening(true);
      current.start();
    } catch {
      recognition.current = null;
      setListening(false);
      setVoiceMessage(
        "Unable to start voice search. Please try again or type your search.",
      );
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        className={className}
        type="button"
        aria-label={listening ? "Cancel voice search" : "Search by voice"}
        aria-pressed={listening}
        aria-describedby={statusId}
        title={listening ? "Cancel voice search" : "Search by voice"}
        onClick={startVoiceSearch}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
        </svg>
      </button>
      <p
        id={statusId}
        role="status"
        className={
          listening || voiceMessage
            ? "pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border bg-[Canvas] p-3 text-sm text-[CanvasText] shadow-lg"
            : "sr-only"
        }
      >
        {listening
          ? "Listening… Click the microphone to cancel."
          : voiceMessage}
      </p>
    </div>
  );
}
