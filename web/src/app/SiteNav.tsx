"use client";

import Image from "next/image";
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
            className="flex items-center gap-3"
            aria-label="COGGS Results home"
          >
            <Image
              src="/logo.svg"
              alt=""
              width={40}
              height={40}
              priority
              className="h-10 w-auto"
            />
            <div className="leading-none">
              <div className="font-bold text-page-foreground tracking-wide text-base">
                COGGS
              </div>
              <div className="font-bold text-accent-1 tracking-wide text-base mt-0.5">
                RESULTS
              </div>
            </div>
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