import { MailCheck } from 'lucide-react'

/* ================================================================
   The page an e-mail link opens when the link would change something
   (confirm a waitlist address, unsubscribe). It only shows a button;
   the change itself happens when the button POSTs to `action`.

   Why not act on the link directly: mail scanners and link previewers
   fetch every URL in a message, so a link that acted on GET would let
   them confirm or unsubscribe on the recipient's behalf. A plain HTML
   form keeps it working without JavaScript.
   ================================================================ */

export function EmailLinkAction({
  title,
  body,
  buttonLabel,
  action,
  token,
}: {
  title: string
  body: string
  buttonLabel: string
  /** Route handler that performs the change on POST. */
  action: string
  token: string
}) {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-bg-surface-2 text-amber-500">
        <MailCheck className="size-7" />
      </div>
      <h1 className="mb-3 font-display text-4xl leading-tight tracking-tight">{title}</h1>
      <p className="mb-8 text-lg leading-relaxed text-neutral-300">{body}</p>
      <form method="post" action={action}>
        <input type="hidden" name="token" value={token} />
        {/* Tells the handler a person pressed the button (redirect to a
            status page) rather than a mail client's one-click POST. */}
        <input type="hidden" name="via" value="page" />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500 bg-amber-500 px-6 py-3 text-base font-medium text-blue-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
        >
          {buttonLabel}
        </button>
      </form>
    </section>
  )
}
