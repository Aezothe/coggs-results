"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type FeedbackType = "Feedback" | "Bug report" | "Feature request";

export function FeedbackDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  const [type, setType] = useState<FeedbackType>("Feedback");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [openedAt, setOpenedAt] = useState<number>(0);
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Open/close the native dialog when prop changes
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setOpenedAt(Date.now());
      // Reset form state on open
      setType("Feedback");
      setMessage("");
      setWebsite("");
      setStatus("idle");
      setErrorMsg(null);
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Handle backdrop / Esc close
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const handleClose = () => onClose();
    d.addEventListener("close", handleClose);
    return () => d.removeEventListener("close", handleClose);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message,
          url_path: pathname,
          website,
          opened_at: openedAt,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json?.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("ok");
      // Auto-close after a short pause so the user sees the success
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="rounded-lg p-0 backdrop:bg-black/40 max-w-md w-[90vw]"
      onClick={(e) => {
        // Close if the user clicks the backdrop
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={onSubmit}
        className="p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-gray-900">Feedback</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {status === "ok" ? (
          <p className="text-sm text-green-700 py-6 text-center">
            Thanks! Your submission was received.
          </p>
        ) : (
          <>
            <label className="block mb-3 text-sm">
              <span className="text-gray-700 block mb-1">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
                className="block w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                disabled={status === "submitting"}
              >
                <option value="Feedback">Feedback</option>
                <option value="Bug report">Bug report</option>
                <option value="Feature request">Feature request</option>
              </select>
            </label>

            <label className="block mb-3 text-sm">
              <span className="text-gray-700 block mb-1">Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={5000}
                required
                disabled={status === "submitting"}
                className="block w-full border border-gray-300 rounded px-2 py-1.5 text-sm resize-y"
                placeholder="What's on your mind?"
              />
            </label>

            {/* Honeypot — hidden from real users */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute opacity-0 pointer-events-none h-0 w-0"
            />

            {errorMsg && (
              <p className="text-sm text-red-600 mb-3">{errorMsg}</p>
            )}

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={status === "submitting"}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={status === "submitting" || message.trim().length === 0}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "submitting" ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}