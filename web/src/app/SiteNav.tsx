"use client";

import Link from "next/link";
import { useState } from "react";
import { FeedbackDialog } from "@/components/FeedbackDialog";

export function SiteNav() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-6 text-sm">
          <Link href="/" className="font-semibold text-gray-900">
            COGGS Results
          </Link>
          <div className="flex items-center gap-4 text-gray-600">
            <Link href="/events" className="hover:text-gray-900">
              Events
            </Link>
            <Link href="/people" className="hover:text-gray-900">
              People
            </Link>
            <Link href="/stages" className="hover:text-gray-900">
              Stages
            </Link>
            <Link href="/terrain" className="hover:text-gray-900">
              Terrain
            </Link>
          </div>

          {/* Right-side actions */}
          <div className="ml-auto">
            <button
              onClick={() => setFeedbackOpen(true)}
              className="text-gray-600 hover:text-gray-900"
            >
              Feedback
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