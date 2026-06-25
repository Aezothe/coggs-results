"use client";

import Link from "next/link";
import { useState } from "react";
import { FeedbackDialog } from "@/components/FeedbackDialog";

export function SiteNav() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <nav className="border-b border-page-border bg-page">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-6 text-sm">
          <Link href="/"
            className="font-semibold text-page-foreground"
          >
            COGGS Results
          </Link>
          <div className="flex items-center gap-4 text-page-muted">
            <Link href="/events" className="hover:text-page-foreground">
              Events
            </Link>
            <Link href="/people" className="hover:text-page-foreground">
              People
            </Link>
            <Link href="/stages" className="hover:text-page-foreground">
              Stages
            </Link>
            <Link href="/terrain" className="hover:text-page-foreground">
              Terrain
            </Link>
          </div>

          {/* Right-side actions */}
          <div className="ml-auto">
            <button
              onClick={() => setFeedbackOpen(true)}
              className="text-page-muted hover:text-page-foreground"
            >
              Feedback Form
            </button>
          </div>
        </div>
      </nav>

      <FeedbackDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </>
  );
}