import "server-only";
import type { ReminderChannel } from "@prisma/client";

/**
 * Messaging integration layer.
 *
 * V1 ships with no external provider: reminders are recorded in ReminderLog and delivered
 * in-app as Notifications. To connect SMS/WhatsApp/email (Africa's Talking, Twilio,
 * SendPulse, …), implement MessagingProvider in a new file, register it in `PROVIDERS`
 * below and set MESSAGING_PROVIDER=<name> in the environment.
 */
export interface OutboundMessage {
  channel: Exclude<ReminderChannel, "IN_APP">;
  /** Phone number (E.164 preferred) or email address, depending on channel. */
  to: string;
  subject?: string;
  body: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface MessagingProvider {
  readonly name: string;
  supports(channel: OutboundMessage["channel"]): boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}

/** Development provider: prints messages to the server log and reports success. */
const logProvider: MessagingProvider = {
  name: "log",
  supports: () => true,
  async send(m) {
    console.info(`[messaging:log] ${m.channel} → ${m.to}: ${m.body}`);
    return { ok: true, providerMessageId: `log-${Date.now()}` };
  },
};

const PROVIDERS: Record<string, MessagingProvider> = {
  log: logProvider,
  // africastalking: africasTalkingProvider,
  // twilio: twilioProvider,
  // sendpulse: sendPulseProvider,
};

/** The configured provider, or null when external delivery is disabled. */
export function getMessagingProvider(): MessagingProvider | null {
  const name = process.env.MESSAGING_PROVIDER?.trim().toLowerCase();
  if (!name) return null;
  const p = PROVIDERS[name];
  if (!p) {
    console.warn(`[messaging] Unknown MESSAGING_PROVIDER "${name}" — external delivery disabled.`);
    return null;
  }
  return p;
}
