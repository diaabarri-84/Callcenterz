import type { AgentAccount, Booking, BulkSendResult, EmailTemplate, Lead, LeadInsert, LogOutcomeInput, MailFolder, MailMessage, QueueStats } from '../types'

/** Everything the UI needs from a backend. Implemented by phpApi (cPanel) and demoApi. */
export interface Api {
  mode: 'server' | 'demo'

  /** Next due lead, locked to the current agent. null when the queue is empty. `exclude` = leads skipped this session. */
  getNextLead(exclude?: string[]): Promise<Lead | null>
  /** The next few leads in the queue (not including the agent's current one). */
  listUpcoming(exclude?: string[]): Promise<Lead[]>
  /** Takes a specific lead to call now; fails while a colleague has it on screen. */
  claimLead(id: string): Promise<Lead>
  logOutcome(input: LogOutcomeInput): Promise<void>
  queueStats(): Promise<QueueStats>

  listLeads(): Promise<Lead[]>
  updateLead(id: string, patch: Partial<Pick<Lead, 'notes' | 'status' | 'next_call_at' | 'email' | 'phone' | 'kontaktperson' | 'email_opt_out'>>): Promise<void>
  /**
   * Inserts new leads. For leads already present (same dedupe_key) only the web-enrichment
   * columns are updated — call status and history are never touched.
   */
  importLeads(rows: LeadInsert[]): Promise<{ inserted: number; enriched: number }>

  listBookings(from: Date, to: Date): Promise<Booking[]>
  /** Leads rescheduled ("Svarade inte" / "En annan dag") that become due in the range. */
  listScheduled(from: Date, to: Date): Promise<Lead[]>

  listTemplates(): Promise<EmailTemplate[]>
  saveTemplate(t: Omit<EmailTemplate, 'id'> & { id?: string }): Promise<EmailTemplate>
  deleteTemplate(id: string): Promise<void>
  sendEmail(leadId: string, templateId: string): Promise<void>
  /** Sends from the cPanel mailbox in batches of 10; templateId 'auto' picks the best template per niche. */
  sendBulk(
    leadIds: string[],
    templateId: string | 'auto',
    opts: { skipAlreadyEmailed: boolean; onProgress?: (done: number, total: number, acc: BulkSendResult) => void; signal?: AbortSignal },
  ): Promise<BulkSendResult>

  /** cPanel mailbox over IMAP (Utskick → Inkorg). */
  listMail(folder: MailFolder, search?: string): Promise<{ mailbox: string; messages: MailMessage[] }>
  getMail(id: string): Promise<MailMessage>
  replyMail(id: string, text: string): Promise<void>
  markMailRead(id: string): Promise<void>

  /** Admin only. */
  listAgents(): Promise<AgentAccount[]>
  saveAgent(a: Omit<AgentAccount, 'id' | 'last_login_at'> & { id?: string }): Promise<AgentAccount>
}
