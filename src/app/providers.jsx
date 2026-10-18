"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/auth/AuthProvider";
import { rememberRef } from "@/utils/ref";

/**
 * What every page sits inside, in the browser: signing in (the account, the
 * sheet), and the tracking link a visitor landed with (?ref=), kept for the
 * sign-up a moment later.
 */
export default function Providers({ children }) {
  useEffect(() => {
    rememberRef();
  }, []);
  return <AuthProvider>{children}</AuthProvider>;
}
