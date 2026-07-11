import { OrgRequestForm } from '@/components/platform/org-request-form'

export const metadata = {
  title: 'Request an organisation — The Superhero',
}

export default function OrgRequestPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        <header>
          <h1 className="mb-3 font-display text-[clamp(32px,4vw,48px)] font-normal leading-none tracking-tight">
            Bring your <em className="italic text-amber-500">organisation</em>.
          </h1>
          <p className="max-w-[560px] text-lg leading-relaxed text-fg-secondary">
            An organisation page gives your group a public face, private members-only projects,
            and a shared record of the hours your people contribute. We approve each request by
            hand to keep impersonators out.
          </p>
        </header>
        <OrgRequestForm />
      </div>
    </div>
  )
}
