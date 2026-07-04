'use client'

/**
 * Last-resort boundary — replaces the root layout when even that fails,
 * so it must render its own <html>/<body> and can't rely on globals.css.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          background: '#0E1A2B',
          color: '#EBF1F7',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <h1 style={{ fontSize: '28px', margin: 0 }}>Something went badly wrong.</h1>
        <p style={{ maxWidth: 420, color: '#A8BCCE', fontSize: 14, lineHeight: 1.6 }}>
          The whole page failed to render{error.digest ? ` (ref ${error.digest})` : ''}.
          Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: '#F4A535',
            color: '#0E1A2B',
            border: 0,
            borderRadius: 8,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </body>
    </html>
  )
}
