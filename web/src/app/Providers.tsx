"use client";

import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export function Providers() {
  return (
    <>
      <ProgressBar
        height="3px"
        color="#2563eb"
        options={{ showSpinner: false }}
        shallowRouting
      />
      <Analytics />
      <SpeedInsights />
    </>
  );
}