import type { ServerConfig } from '@reviewinbox/config'
import nodemailer from 'nodemailer'

type InvitationEmailInput = {
  email: string
  invitedByEmail: string
  invitedByName: string
  inviteLink: string
  organizationName: string
}

type PasswordResetEmailInput = {
  email: string
  resetLink: string
}

export function invitationEmailEnabled(config: ServerConfig): boolean {
  return Boolean(config.smtpHost && config.mailFrom)
}

export function passwordResetEmailEnabled(config: ServerConfig): boolean {
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

export async function sendPasswordResetEmail(input: PasswordResetEmailInput, config: ServerConfig): Promise<void> {
  if (!passwordResetEmailEnabled(config)) {
    throw new Error('Password reset email delivery is not configured.')
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS: !config.smtpSecure && !isLocalSmtpHost(config.smtpHost),
    auth: config.smtpUser && config.smtpPassword ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
  })

  const copy = passwordResetCopy(resetEmailLanguage(input.resetLink))

  await transporter.sendMail({
    from: config.mailFrom,
    to: input.email,
    subject: copy.subject,
    text: [copy.intro, '', `${copy.action}: ${input.resetLink}`, '', copy.ignore].join('\n'),
    html: `<p>${copy.intro}</p><p><a href="${escapeHtml(input.resetLink)}">${copy.action}</a></p><p>${copy.ignore}</p>`,
  })
}

/**
 * Dispatch reset delivery in-process without making the Better Auth response wait for SMTP.
 * A long-lived API process must remain available for the best-effort delivery to complete.
 */
export function dispatchPasswordResetEmail(input: PasswordResetEmailInput, config: ServerConfig): void {
  void sendPasswordResetEmail(input, config).catch(() => {
    console.error('Password reset email delivery failed.')
  })
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function isLocalSmtpHost(host: string | undefined): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

// Better Auth embeds the frontend redirect in callbackURL; only supported languages
// select static copy. The URL and its contents are never interpolated into the subject.
function resetEmailLanguage(resetLink: string): 'en' | 'fr' {
  try {
    const callback = new URL(resetLink).searchParams.get('callbackURL')
    return callback && new URL(callback).searchParams.get('lang') === 'fr' ? 'fr' : 'en'
  } catch {
    return 'en'
  }
}

function passwordResetCopy(language: 'en' | 'fr') {
  return language === 'fr'
    ? {
        subject: 'Réinitialisez votre mot de passe ReviewInbox',
        intro: 'Nous avons reçu une demande de réinitialisation de votre mot de passe ReviewInbox.',
        action: 'Réinitialiser votre mot de passe',
        ignore: 'Si vous n’avez pas fait cette demande, vous pouvez ignorer cet e-mail.',
      }
    : {
        subject: 'Reset your ReviewInbox password',
        intro: 'We received a request to reset your ReviewInbox password.',
        action: 'Reset your password',
        ignore: 'If you did not request this, you can ignore this email.',
      }
}
