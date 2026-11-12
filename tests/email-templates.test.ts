import { describe, it, expect } from 'vitest'
import { validateEmail, MAX_EMAIL_LENGTH } from '@/lib/validation'
import { renderEmail } from '@/lib/email-templates'

describe('validateEmail', () => {
  it('accepts and normalises a valid address', () => {
    expect(validateEmail('  Person@Example.COM ')).toEqual({ ok: true, email: 'person@example.com' })
  })

  it('rejects an empty address', () => {
    expect(validateEmail('   ')).toEqual({ ok: false, error: { key: 'waitlist.emailRequired' } })
  })

  it('rejects malformed addresses', () => {
    for (const bad of ['nope', 'a@b', 'a@b.', '@example.com', 'a b@example.com', 'two@@example.com']) {
      expect(validateEmail(bad), bad).toEqual({ ok: false, error: { key: 'waitlist.emailInvalid' } })
    }
  })

  it('rejects an over-length address', () => {
    const long = 'a'.repeat(MAX_EMAIL_LENGTH) + '@example.com'
    expect(validateEmail(long)).toEqual({ ok: false, error: { key: 'waitlist.emailInvalid' } })
  })
})

describe('renderEmail', () => {
  const content = renderEmail({
    previewText: 'preview',
    heading: 'Hello & welcome',
    paragraphs: ['First <line>', 'Second line'],
    button: { href: 'https://example.com/confirm?token=abc', label: 'Confirm' },
    footerLines: ['Why you got this'],
    unsubscribe: { url: 'https://example.com/unsub?token=xyz', label: 'Unsubscribe' },
  })

  it('escapes HTML-significant characters in copy', () => {
    expect(content.html).toContain('Hello &amp; welcome')
    expect(content.html).toContain('First &lt;line&gt;')
    // The raw unescaped form must not leak into the markup.
    expect(content.html).not.toContain('First <line>')
  })

  it('renders the button and unsubscribe links', () => {
    expect(content.html).toContain('https://example.com/confirm?token=abc')
    expect(content.html).toContain('>Confirm<')
    expect(content.html).toContain('https://example.com/unsub?token=xyz')
  })

  it('produces a plaintext part with the links and lines', () => {
    expect(content.text).toContain('Hello & welcome')
    expect(content.text).toContain('Confirm: https://example.com/confirm?token=abc')
    expect(content.text).toContain('Unsubscribe: https://example.com/unsub?token=xyz')
    expect(content.text).toContain('Why you got this')
  })
})
