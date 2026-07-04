import Link from 'next/link'
import { LegalPage, LegalSection as Section } from '@/components/ui/legal-page'

export const metadata = {
  title: 'Terms of service — The Superhero',
  description:
    'The rules for using The Superhero: your account, your content, acceptable use, and what we are (and aren’t) responsible for.',
}

/* ================================================================
   Terms of service. Plain-language, tailored to how the platform
   works (user-generated projects/blueprints/updates/messages,
   real-world volunteer activities, admin moderation). Swiss law.
   ================================================================ */

const LAST_UPDATED = '4 July 2026'

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated={LAST_UPDATED}>
      <Section title="The short version">
        <p>
          The Superhero connects people with climate and sustainability projects. You keep
          ownership of what you post, you&rsquo;re responsible for what you post and what
          you do offline, be decent to each other, and we can remove content or accounts
          that break these rules. The long version follows.
        </p>
      </Section>

      <Section title="1. Who we are and what you're agreeing to">
        <p>
          The Superhero (thesuperhe.ro) is operated from Switzerland. By creating an
          account or using the platform you agree to these terms and to our{' '}
          <Link href="/privacy" className="text-amber-500 hover:underline">
            privacy policy
          </Link>
          . If you don&rsquo;t agree with them, don&rsquo;t use the platform.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          You need to be at least 16 years old to use The Superhero. Use your real
          identity, keep your login credentials to yourself, and don&rsquo;t share or sell
          your account. You&rsquo;re responsible for what happens under it. You can delete
          your account at any time from your profile settings.
        </p>
      </Section>

      <Section title="3. What the platform is (and isn't)">
        <p>
          We provide the infrastructure: project pages, blueprints, steps, updates,
          messaging and skill matching. The projects themselves are created and run by
          their leads, not by us. We don&rsquo;t vet projects or their organisers, we
          don&rsquo;t guarantee that a project will happen or succeed, and joining a
          project creates an arrangement between you and that project&rsquo;s community —
          not with us.
        </p>
        <p>
          Many projects involve real-world activities — planting, repairing, organising
          events. Assess them with the same judgment you&rsquo;d apply to any volunteer
          activity: your safety, insurance, permits and legal obligations for offline
          activities are between you and the project you join, and remain your own
          responsibility.
        </p>
      </Section>

      <Section title="4. Your content">
        <p>
          You own what you create here — project descriptions, blueprints, steps, updates
          and messages. So that the platform can work, you grant us a non-exclusive,
          worldwide licence to host, display and distribute your content within the
          service. Content you mark as public is visible to anyone on the internet.
        </p>
        <p>
          Blueprints are special: the whole point is reuse. By publishing a blueprint you
          allow other members to fork, adapt and translate it on the platform, with the
          original credited as the family root.
        </p>
        <p>
          Only post what you have the right to post. If content you upload infringes
          someone else&rsquo;s rights, that&rsquo;s on you — and we&rsquo;ll remove it when
          we&rsquo;re made aware.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>Don&rsquo;t use the platform to:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>post content that is unlawful, defamatory, harassing, hateful or misleading;</li>
          <li>impersonate someone or misrepresent a project or affiliation;</li>
          <li>spam members via messages, updates or join requests;</li>
          <li>advertise unrelated commercial services;</li>
          <li>
            scrape the platform, probe its security, or interfere with its operation
            (rate limits exist for a reason);
          </li>
          <li>collect other members&rsquo; personal data beyond what collaboration requires.</li>
        </ul>
      </Section>

      <Section title="6. Moderation">
        <p>
          We can remove content, steps, projects or blueprints, and suspend or terminate
          accounts, when these terms are broken or when the law requires it. We&rsquo;ll
          use that power sparingly and with judgment — the platform exists to make
          projects happen, not to police them. Project leads additionally moderate their
          own projects (accepting members, managing steps and updates).
        </p>
      </Section>

      <Section title="7. Availability and changes">
        <p>
          The platform is provided &ldquo;as is&rdquo; and free of charge. We work to keep
          it available and correct, but we don&rsquo;t warrant uninterrupted or error-free
          operation, and we may change, suspend or discontinue features. If we ever
          discontinue the platform entirely, we&rsquo;ll give reasonable notice so you can
          export what matters to you.
        </p>
      </Section>

      <Section title="8. Liability">
        <p>
          To the extent permitted by law, we are not liable for indirect damages, lost
          data, lost profits, the content other members post, or anything that happens in
          the real-world activities of projects. Nothing in these terms excludes liability
          for intent or gross negligence, or any other liability that cannot be excluded
          under Swiss law.
        </p>
      </Section>

      <Section title="9. Changes to these terms">
        <p>
          We may update these terms as the platform evolves. The date at the top tells you
          when. For material changes we&rsquo;ll notify you in the app, and continuing to
          use the platform after that means you accept the new version.
        </p>
      </Section>

      <Section title="10. Governing law">
        <p>
          These terms are governed by Swiss law. The courts at the operator&rsquo;s seat in
          Switzerland have jurisdiction, subject to any mandatory consumer-protection
          forums that apply to you.
        </p>
      </Section>

      <p className="mt-12 text-sm text-fg-tertiary">
        Questions?{' '}
        <a href="mailto:support@thesuperhe.ro" className="text-amber-500 hover:underline">
          support@thesuperhe.ro
        </a>{' '}
        · <Link href="/privacy" className="text-amber-500 hover:underline">Privacy policy</Link>{' '}
        · <Link href="/" className="text-amber-500 hover:underline">Back to the homepage</Link>
      </p>
    </LegalPage>
  )
}
