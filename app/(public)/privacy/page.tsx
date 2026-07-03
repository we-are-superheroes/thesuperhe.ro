import Link from 'next/link'

export const metadata = {
  title: 'Privacy policy — The Superhero',
  description:
    'What data The Superhero collects, why, where it lives, and the rights you have over it.',
}

/* ================================================================
   Privacy policy. Written for the platform as it actually works
   today (Clerk auth, Supabase in the EU, Vercel hosting, essential
   cookies only, no analytics). Keep it in sync when that changes —
   especially if analytics or email sending are added.
   ================================================================ */

const LAST_UPDATED = '3 July 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 font-display text-2xl tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-fg-secondary">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-12 sm:px-8 sm:py-16">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-500">
        Legal
      </p>
      <h1 className="font-display text-[clamp(32px,4vw,44px)] leading-tight tracking-tight">
        Privacy policy
      </h1>
      <p className="mt-3 text-sm text-fg-tertiary">Last updated: {LAST_UPDATED}</p>

      <Section title="Who we are">
        <p>
          The Superhero (thesuperhe.ro) is a platform that connects people with climate and
          sustainability projects. It is operated from Switzerland. For anything related to
          your data, contact us at{' '}
          <a href="mailto:privacy@thesuperhe.ro" className="text-amber-500 hover:underline">
            privacy@thesuperhe.ro
          </a>
          . We are the data controller for the personal data described below, and we handle
          it under the Swiss Federal Act on Data Protection (FADP) and, where it applies,
          the EU General Data Protection Regulation (GDPR).
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <strong className="text-fg-primary">Account data.</strong> When you sign up, our
          authentication provider (Clerk) collects your name, email address and, if you use
          a social login, your avatar. We keep a copy of these in our own database so the
          platform can show who you are.
        </p>
        <p>
          <strong className="text-fg-primary">Profile data you choose to add.</strong> A bio,
          a location, a timezone, a profile photo, and the skills you say you have —
          including whether you&rsquo;re looking to use them. All of this is optional.
        </p>
        <p>
          <strong className="text-fg-primary">Content you create.</strong> Projects,
          blueprints, project steps, updates, messages to other members, the steps you join
          and the hours you log. Some of this is public by design (see below).
        </p>
        <p>
          <strong className="text-fg-primary">Technical data.</strong> Our hosting provider
          (Vercel) keeps short-lived server logs (IP address, request path, timestamps) for
          operating and securing the service. We run no advertising or analytics trackers.
        </p>
      </Section>

      <Section title="What we use it for">
        <p>
          To run the platform: showing your profile to other members, matching your skills
          with steps that need them, sending you in-app notifications, and letting you
          message other members. The legal basis is the performance of our contract with
          you (providing the service you signed up for) and our legitimate interest in
          keeping the platform secure and functional. We don&rsquo;t sell your data, and we
          don&rsquo;t use it for advertising.
        </p>
      </Section>

      <Section title="What is public">
        <p>
          This is a collaboration platform, so some things are visible to anyone on the
          internet: projects and their steps, blueprints and their authorship, project
          updates marked &ldquo;public&rdquo;, and your name on content you have publicly
          contributed. Members-only updates are visible only to a project&rsquo;s members.
          Messages are visible only to you and the person you&rsquo;re writing with. Your
          email address is never shown to other users.
        </p>
        <p>
          Uploaded images (profile photos, project covers) are stored in a publicly
          accessible bucket — anyone with the link can view them, so don&rsquo;t upload
          images you wouldn&rsquo;t want public.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use only cookies that are strictly necessary to run the service: the session
          cookies set by Clerk to keep you signed in. Your theme preference is stored in
          your browser&rsquo;s local storage and never leaves your device. There are no
          advertising, analytics or third-party tracking cookies, which is why you
          don&rsquo;t see a cookie banner.
        </p>
      </Section>

      <Section title="Where your data lives">
        <p>Our service providers (processors) are:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="text-fg-primary">Supabase</strong> — database and image
            storage, hosted on AWS in the EU (Ireland, eu-west-1).
          </li>
          <li>
            <strong className="text-fg-primary">Clerk</strong> — authentication, based in
            the United States. Transfers are covered by the EU Standard Contractual
            Clauses.
          </li>
          <li>
            <strong className="text-fg-primary">Vercel</strong> — application hosting and
            server logs.
          </li>
        </ul>
        <p>
          Each of these processes data only on our instructions and under a data processing
          agreement.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          For as long as you have an account. If you delete your account, your profile,
          skills and contributions are deleted with it. Content that other people depend on
          — messages you sent, public updates you posted — is kept but detached from your
          identity and shown as coming from a deleted or former member. Server logs are
          retained by our hosting provider for a short period and then discarded.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the FADP and GDPR you can ask us for access to the data we hold about you,
          have it corrected or deleted, receive a copy in a portable format, or object to
          or restrict how we process it. Write to{' '}
          <a href="mailto:privacy@thesuperhe.ro" className="text-amber-500 hover:underline">
            privacy@thesuperhe.ro
          </a>{' '}
          and we&rsquo;ll respond within 30 days. You can also delete your account yourself
          from your profile settings at any time.
        </p>
        <p>
          If you believe we&rsquo;re mishandling your data, you have the right to complain
          to a supervisory authority — in Switzerland the Federal Data Protection and
          Information Commissioner (FDPIC), or your local data protection authority in the
          EU/EEA.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we change how we handle your data — for example, if we start sending email
          notifications — we&rsquo;ll update this page and adjust the date at the top. For
          significant changes we&rsquo;ll tell you in the app.
        </p>
      </Section>

      <p className="mt-12 text-sm text-fg-tertiary">
        Questions?{' '}
        <a href="mailto:privacy@thesuperhe.ro" className="text-amber-500 hover:underline">
          privacy@thesuperhe.ro
        </a>{' '}
        · <Link href="/" className="text-amber-500 hover:underline">Back to the homepage</Link>
      </p>
    </div>
  )
}
