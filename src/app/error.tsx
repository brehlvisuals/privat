"use client";

import ErrorView from "./error-view";

// Fängt Abstürze der App-Seite ab (statt Next.js' „This page couldn't load").
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} kind="boundary" />;
}
