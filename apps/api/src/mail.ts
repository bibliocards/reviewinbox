import type { ServerConfig } from '@reviewinbox/config'
import nodemailer from 'nodemailer'

type InvitationEmailInput = {
  email: string
  invitedByEmail: string
  invitedByName: string
  inviteLink: string
  organizationName: string
}

export function invitationEmailEnabled(config: ServerConfig): boolean {
  return Boolean(config.smtpHost && config.mailFrom)
}

export function invitationLink(invitationId: string, config: ServerConfig): string {
  return new URL(`/accept-invitation/${invitationId}`, config.appPublicUrl).toString()
}

export async function sendInvitationEmail(input: InvitationEmailInput, config: ServerConfig): Promise<void> {
  if (!invitationEmailEnabled(config)) {
    console.info('Invitation email skipped because SMTP is not configured.')
    return
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS: !config.smtpSecure && !isLocalSmtpHost(config.smtpHost),
    auth: config.smtpUser && config.smtpPassword ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
  })

  await transporter.sendMail({
    from: config.mailFrom,
    to: input.email,
    subject: `${input.invitedByName} invited you to ${input.organizationName} on ReviewInbox`,
    text: [
      `${input.invitedByName} (${input.invitedByEmail}) invited you to join ${input.organizationName} on ReviewInbox.`,
      '',
      `Accept the invitation: ${input.inviteLink}`,
    ].join('\n'),
    html: `<p>${escapeHtml(input.invitedByName)} (${escapeHtml(input.invitedByEmail)}) invited you to join <strong>${escapeHtml(input.organizationName)}</strong> on ReviewInbox.</p><p><a href="${escapeHtml(input.inviteLink)}">Accept the invitation</a></p>`,
  })
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function isLocalSmtpHost(host: string | undefined): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}
