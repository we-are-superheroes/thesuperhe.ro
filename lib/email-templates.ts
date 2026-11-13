import 'server-only'
import { SITE_URL } from '@/lib/site'

/* ================================================================
   Email templates — layout only. All copy is passed in already
   localised by the caller (rendered from the message catalogs via
   getTranslations in the recipient's locale), so these builders
   stay dumb and translation lives in one place.

   Plain, inline-styled, light-background HTML: that is what mail
   clients render reliably, regardless of the app's dark theme.
   ================================================================ */

export interface EmailButton {
  href: string
  label: string
}

export interface EmailContent {
  /** Hidden preheader shown in the inbox preview line. */
  previewText: string
  heading: string
  /** Body paragraphs, plain text — rendered as escaped <p> blocks. */
  paragraphs: string[]
  button?: EmailButton
  /** Small print under a divider (e.g. why-you-got-this). */
  footerLines?: string[]
  /** Optional unsubscribe link rendered in the footer. */
  unsubscribe?: { url: string; label: string }
}

/* The two-leaves brand mark (components/ui/logo.tsx `LeavesMark`) as a PNG.
   Mail clients such as Gmail and Outlook do not render SVG, so the e-mail
   header loads this hosted image instead; public/email/logo.png is the same
   artwork at 144px (shown at 36px, so it stays sharp on high-density
   screens). If the mark changes, re-export this file. */
const LOGO_URL = `${SITE_URL}/email/logo.png`

const BRAND = '#f4a535' // amber accent
const INK = '#1a2b1f'
const MUTED = '#6b7280'
const BG = '#f4f5f3'
const CARD = '#ffffff'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const paragraphs = c.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK};">${esc(p)}</p>`,
    )
    .join('')

  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td style="border-radius:8px;background:${BRAND};">
         <a href="${esc(c.button.href)}" style="display:inline-block;padding:13px 22px;font-size:16px;font-weight:600;color:#3a2600;text-decoration:none;border-radius:8px;">${esc(c.button.label)}</a>
       </td></tr></table>`
    : ''

  const footerBits: string[] = []
  for (const line of c.footerLines ?? []) {
    footerBits.push(`<div style="margin:0 0 6px;">${esc(line)}</div>`)
  }
  if (c.unsubscribe) {
    footerBits.push(
      `<div style="margin:6px 0 0;"><a href="${esc(c.unsubscribe.url)}" style="color:${MUTED};text-decoration:underline;">${esc(c.unsubscribe.label)}</a></div>`,
    )
  }
  const footer = footerBits.length
    ? `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.5;color:${MUTED};">${footerBits.join('')}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
</head>
<body style="margin:0;padding:0;background:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:28px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:10px;vertical-align:middle;">
            <img src="${esc(LOGO_URL)}" width="36" height="36" alt="" style="display:block;border:0;outline:none;" />
          </td>
          <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:${INK};">
            The <span style="color:${BRAND};">Superhero</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:20px 32px 32px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;font-weight:400;color:${INK};">${esc(c.heading)}</h1>
        ${paragraphs}
        ${button}
        ${footer}
      </td></tr>
    </table>
    <div style="max-width:560px;margin:16px auto 0;font-size:12px;color:${MUTED};text-align:center;">The Superhero · Switzerland</div>
  </td></tr>
</table>
</body>
</html>`

  const textParts = [c.heading, '', ...c.paragraphs]
  if (c.button) textParts.push('', `${c.button.label}: ${c.button.href}`)
  if (c.footerLines?.length) textParts.push('', ...c.footerLines)
  if (c.unsubscribe) textParts.push('', `${c.unsubscribe.label}: ${c.unsubscribe.url}`)
  const text = textParts.join('\n')

  return { html, text }
}
