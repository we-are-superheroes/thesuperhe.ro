import 'server-only'

/* Helpers for the route handlers behind e-mail links (confirm /
   unsubscribe). Those handlers accept two kinds of POST:
     - a person pressing the button on our page (form fields `token` and
       `via=page`) → answer with a redirect to a status page;
     - a mail client's RFC 8058 one-click POST (token in the query string,
       body `List-Unsubscribe=One-Click`) → answer with a bare 200. */

export interface EmailLinkPost {
  token: string
  /** True when the POST came from the button on our own page. */
  fromPage: boolean
}

export async function readEmailLinkPost(req: Request): Promise<EmailLinkPost> {
  const queryToken = new URL(req.url).searchParams.get('token') ?? ''
  let formToken = ''
  let fromPage = false
  try {
    const form = await req.formData()
    const t = form.get('token')
    if (typeof t === 'string') formToken = t
    fromPage = form.get('via') === 'page'
  } catch {
    // No (or unreadable) body — a one-click POST with the token in the URL.
  }
  return { token: formToken || queryToken, fromPage }
}

/** 303 so the browser follows the redirect with a GET after the form POST. */
export function seeOther(req: Request, path: string): Response {
  return Response.redirect(new URL(path, req.url), 303)
}
