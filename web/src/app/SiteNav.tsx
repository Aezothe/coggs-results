"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FeedbackDialog } from "@/components/FeedbackDialog";

export function SiteNav() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="border-b border-page-border bg-page">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <Link href="/"
              className="flex items-center gap-3 shrink-0"
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

            {/* Desktop: inline nav. Hidden on mobile. */}
            <div className="hidden md:flex items-center gap-4 text-sm text-page-muted ml-auto">
              <Link href="/events" className="hover:text-page-foreground">
                Events
              </Link>
              <Link href="/people" className="hover:text-page-foreground">
                People
              </Link>
              <Link href="/stages" className="hover:text-page-foreground">
                Stages
              </Link>
              <Link href=" /terrain" className="hover:text-page-foreground">
                Terrain
              </Link>
              <button
                onClick={() => setFeedbackOpen(true)}
                className="text-page-muted hover:text-page-foreground"
              >
                Feedback Form
              </button>
            </div>

            {/* Mobile: hamburger button. Hidden on desktop. */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden inline-flex items-center justify-center rounded p-2 text-page-foreground hover:bg-page-border"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {menuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Mobile dropdown panel */}
          {menuOpen && (
            <div className="md:hidden mt-3 flex flex-col gap-2 text-sm text-page-muted border-t border-page-border pt-3">
              <Link href="/events"
                onClick={() => setMenuOpen(false)}
                className="py-1 hover:text-page-foreground"
              >
                Events
              </Link>
              <Link href="/people"
                onClick={() => setMenuOpen(false)}
                className="py-1 hover:text-page-foreground"
              >
                People
              </Link>
              <Link href="/stages"
                onClick={() => setMenuOpen(false)}
                className="py-1 hover:text-page-foreground"
              >
                Stages
              </Link>
              <Link href="/terrain"
                onClick={() => setMenuOpen(false)}
                className="py-1 hover:text-page-foreground"
              >
                Terrain
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setFeedbackOpen(true);
                }}
                className="text-left py-1 hover:text-page-foreground"
              >
                Feedback Form
              </button>
            </div>
          )}
        </div>
      </nav>

      <FeedbackDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </>
  );
}