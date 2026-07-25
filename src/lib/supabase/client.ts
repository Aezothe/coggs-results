"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client with the anon key.
 * Use this in "use client" components.
 */
export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}