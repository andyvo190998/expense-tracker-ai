export type EmailRequest = {
  eventId: string;
  recipients: string;
  subject: string;
  text: string;
  deadline: number;
};

export type DeliveryContext = {
  signal: AbortSignal;
  checkpoint: () => Promise<void>;
};

export type DeliveryOutcome = { acceptId: string } | { reason: string };

export interface EmailSender {
  send(email: EmailRequest, context: DeliveryContext): Promise<DeliveryOutcome>;
}
