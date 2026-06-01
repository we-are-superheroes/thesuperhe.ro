import { MarketingHome } from '../page'

/* ================================================================
   /home — the marketing landing page, reachable by anyone.

   `/` redirects signed-in users to their dashboard, so this gives
   them (and anyone) a stable URL for the landing page itself.
   ================================================================ */

export default function HomePage() {
  return <MarketingHome />
}
