"use client";

import ErrorView from "./error-view";

// Letztes Sicherheitsnetz, falls sogar das Root-Layout abstürzt.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ margin: 0, background: "#000" }}>
        <ErrorView error={error} reset={reset} kind="global" />
      </body>
    </html>
  );
}
