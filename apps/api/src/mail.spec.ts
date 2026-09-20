import type { ServerConfig } from '@reviewinbox/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mailer = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mailer.createTransport,
  },
}))

import { dispatchPasswordResetEmail, passwordResetEmailEnabled, sendPasswordResetEmail } from './mail'

const smtpConfig = {
  appPublicUrl: 'https://reviewinbox.example',
  smtpHost: 'smtp.example',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: 'smtp-user',
  smtpPassword: 'smtp-password',
  mailFrom: 'ReviewInbox <no-reply@example.com>',
} as ServerConfig

const noMailConfig = {
  ...smtpConfig,
  smtpHost: undefined,
  mailFrom: undefined,
} as ServerConfig

describe('password reset mail', () => {
  beforeEach(() => {
    mailer.createTransport.mockReset()
    mailer.sendMail.mockReset()
    mailer.createTransport.mockReturnValue({ sendMail: mailer.sendMail })
    mailer.sendMail.mockResolvedValue({ messageId: 'test-message' })
  })

  it('reports delivery as unavailable when SMTP is not configured', async () => {
    expect(passwordResetEmailEnabled(noMailConfig)).toBe(false)

    await expect(
      sendPasswordResetEmail(
        { email: 'owner@example.com', resetLink: 'https://reviewinbox.example/reset-password?token=secret' },
        noMailConfig,
      ),
    ).rejects.toThrow('Password reset email delivery is not configured.')
    expect(mailer.createTransport).not.toHaveBeenCalled()
  })

  it('sends a reset link without exposing the token in the subject', async () => {
    expect(passwordResetEmailEnabled(smtpConfig)).toBe(true)

    await sendPasswordResetEmail(
      { email: 'owner@example.com', resetLink: 'https://reviewinbox.example/reset-password?token=secret&x=1' },
      smtpConfig,
    )

    expect(mailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'smtp-user', pass: 'smtp-password' },
    })
    expect(mailer.sendMail).toHaveBeenCalledWith({
      from: 'ReviewInbox <no-reply@example.com>',
      to: 'owner@example.com',
      subject: 'Reset your ReviewInbox password',
      text: expect.stringContaining('https://reviewinbox.example/reset-password?token=secret&x=1'),
      html: expect.stringContaining('href="https://reviewinbox.example/reset-password?token=secret&amp;x=1"'),
    })
  })
  it.each([
    ['fr', 'Réinitialisez votre mot de passe ReviewInbox'],
    ['en', 'Reset your ReviewInbox password'],
    ['unsupported', 'Reset your ReviewInbox password'],
  ])('uses supported callback language %s for reset mail', async (language, subject) => {
    const resetLink = new URL('https://reviewinbox.example/api/auth/reset-password/test-token')
    resetLink.searchParams.set('callbackURL', `https://reviewinbox.example/reset-password?lang=${language}`)
    await sendPasswordResetEmail({ email: 'owner@example.com', resetLink: resetLink.toString() }, smtpConfig)
    expect(mailer.sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject }))
  })

  it('does not wait for a blocked SMTP promise', () => {
    let resolveDelivery!: () => void
    mailer.sendMail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDelivery = () => resolve({ messageId: 'delayed-message' })
      }),
    )

    expect(
      dispatchPasswordResetEmail(
        { email: 'owner@example.com', resetLink: 'https://reviewinbox.example/reset-password?token=secret' },
        smtpConfig,
      ),
    ).toBeUndefined()
    expect(mailer.sendMail).toHaveBeenCalledTimes(1)

    resolveDelivery()
  })

  it('swallows SMTP failures and logs a generic message without secrets', async () => {
    const smtpError = new Error('SMTP auth failed for owner@example.com with password smtp-password')
    mailer.sendMail.mockRejectedValueOnce(smtpError)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    dispatchPasswordResetEmail(
      { email: 'owner@example.com', resetLink: 'https://reviewinbox.example/reset-password?token=secret' },
      smtpConfig,
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errorSpy).toHaveBeenCalledWith('Password reset email delivery failed.')
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('owner@example.com')
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('smtp-password')
    errorSpy.mockRestore()
  })
})
