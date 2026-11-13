export interface MagicLinkMessage { to: string; url: string }
export interface EmailSender { sendMagicLink(m: MagicLinkMessage): Promise<void> }

/** Dev/test only: records links in memory (and prints them outside tests). Refused in production by env validation. */
export function createConsoleSender(log: (m: string) => void = console.info): EmailSender & { sent: MagicLinkMessage[] } {
  const sent: MagicLinkMessage[] = [];
  return {
    sent,
    async sendMagicLink(m) {
      sent.push(m);
      log(`[dev email] magic link for ${m.to}: ${m.url}`);
    },
  };
}

/**
 * Resend over HTTPS (never SMTP: Render blocks SMTP ports, and Workers/Vercel prefer fetch).
 * Free tier: 100/day, 3000/month; a verified sending domain is likely required (docs/free-tier.md §2).
 */
export function createResendSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): EmailSender {
  return {
    async sendMagicLink({ to, url }) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject: "Your Chowk sign-in link", text: `Sign in to Chowk: ${url}\n\nThis link expires in 10 minutes. If you did not ask for it, ignore this email.` }),
      });
      if (!res.ok) throw new Error(`email provider rejected the request (${res.status})`); // never include body/keys
    },
  };
}
