"use client";

import { useEffect } from "react";

/** Shown instead of a bare technical message when a page fails. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="auth">
      <div className="auth-wrap">
        <section className="auth-card">
          <h1 className="auth-h">Something went wrong</h1>
          <p className="auth-lede">That didn&apos;t load. Nothing you saved is lost. Try again, and if it keeps happening, tell your Admin{error.digest ? ` and give them this code: ${error.digest}` : ""}.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={() => reset()}>
              Try again
            </button>
            <a className="btn" href="/">
              Go to Home
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
