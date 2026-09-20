import { loadServerConfig } from '@reviewinbox/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MailDelivery, MailTransport, SmtpTransportOptions } from './mail'
import {
  dispatchPasswordResetEmail,
  passwordResetEmailEnabled,
  sendPasswordResetEmail,
} from './mail'

const mailer = createMailDeliveryHarness()
const smtpConfig = loadServerConfig({
  DATABASE_URL: 'postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox',
  APP_PUBLIC_URL: 'https://reviewinbox.example',
  SMTP_HOST: 'smtp.example',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'smtp-user',
  SMTP_PASSWORD: 'smtp-password',
  MAIL_FROM: 'ReviewInbox <no-reply@example.com>',
})
const noMailConfig = loadServerConfig({
  DATABASE_URL: 'postgres://reviewinbox:reviewinbox@localhost:5432/reviewinbox',
  APP_PUBLIC_URL: 'https://reviewinbox.example',
})

describe('password reset mail configuration', () => {
  it('reports delivery as unavailable when SMTP is not configured', async () => {
    expect(passwordResetEmailEnabled(noMailConfig)).toBe(false)

    await expect(
      sendPasswordResetEmail(
        {
          email: 'owner@example.com',
          resetLink: 'https://reviewinbox.example/reset-password?token=secret',
        },
        noMailConfig,
        mailer.delivery,
      ),
    ).rejects.toThrow('Password reset email delivery is not configured.')
    expect(mailer.createTransport).not.toHaveBeenCalled()
  })
})

describe('password reset mail delivery', () => {
  beforeEach(() => {
    mailer.reset()
  })

  it('sends a reset link without exposing the token in the subject', async () => {
    expect(passwordResetEmailEnabled(smtpConfig)).toBe(true)

    await sendPasswordResetEmail(
      {
        email: 'owner@example.com',
        resetLink: 'https://reviewinbox.example/reset-password?token=secret&x=1',
      },
      smtpConfig,
      mailer.delivery,
    )

    expect(mailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'smtp-user', pass: 'smtp-password' },
    })
    const sentMail = mailer.sendMail.mock.calls[0]?.[0]
    expect(sentMail).toMatchObject({
      from: 'ReviewInbox <no-reply@example.com>',
      to: 'owner@example.com',
      subject: 'Reset your ReviewInbox password',
    })
    expect(sentMail?.text).toContain('https://reviewinbox.example/reset-password?token=secret&x=1')
    expect(sentMail?.html).toContain(
      'href="https://reviewinbox.example/reset-password?token=secret&amp;x=1"',
    )
  })

  it.each([
    ['fr', 'Réinitialisez votre mot de passe ReviewInbox'],
    ['en', 'Reset your ReviewInbox password'],
    ['unsupported', 'Reset your ReviewInbox password'],
  ])('uses supported callback language %s for reset mail', async (language, subject) => {
    const resetLink = new URL('https://reviewinbox.example/api/auth/reset-password/test-token')
    resetLink.searchParams.set(
      'callbackURL',
      `https://reviewinbox.example/reset-password?lang=${language}`,
    )
    await sendPasswordResetEmail(
      { email: 'owner@example.com', resetLink: resetLink.toString() },
      smtpConfig,
      mailer.delivery,
    )
    expect(mailer.sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject }))
  })
})

describe('password reset dispatch', () => {
  beforeEach(() => {
    mailer.reset()
  })

  it('does not wait for a blocked SMTP promise', () => {
    const deferredDelivery = createDeferred()
    mailer.sendMail.mockReturnValueOnce(deferredDelivery.promise)

    dispatchPasswordResetEmail(
      {
        email: 'owner@example.com',
        resetLink: 'https://reviewinbox.example/reset-password?token=secret',
      },
      smtpConfig,
      mailer.delivery,
    )
    expect(mailer.sendMail).toHaveBeenCalledTimes(1)

    deferredDelivery.resolve()
  })
})

describe('password reset failure handling', () => {
  beforeEach(() => {
    mailer.reset()
  })

  it('swallows SMTP failures and logs a generic message without secrets', async () => {
    const smtpError = new Error(
      'SMTP auth failed for owner@example.com with password smtp-password',
    )
    mailer.sendMail.mockRejectedValueOnce(smtpError)
    const errorSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    dispatchPasswordResetEmail(
      {
        email: 'owner@example.com',
        resetLink: 'https://reviewinbox.example/reset-password?token=secret',
      },
      smtpConfig,
      mailer.delivery,
    )
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(errorSpy).toHaveBeenCalledWith('Password reset email delivery failed.\n')
    const loggedOutput = errorSpy.mock.calls.flat().map(String).join(' ')
    expect(loggedOutput).not.toContain('owner@example.com')
    expect(loggedOutput).not.toContain('smtp-password')
    errorSpy.mockRestore()
  })
})

type DeferredPromise = { promise: Promise<void>; resolve: () => void }

function createDeferred(): DeferredPromise {
  let resolvePromise: (() => void) | null = null
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: () => resolvePromise?.() }
}

function createMailDeliveryHarness() {
  const createTransport = vi.fn<MailDelivery['createTransport']>()
  const sendMail = vi.fn<MailTransport['sendMail']>()
  const delivery: MailDelivery = { createTransport }

  function reset(): void {
    createTransport.mockReset()
    sendMail.mockReset()
    createTransport.mockImplementation((options: SmtpTransportOptions) => {
      expect(options.host).toBe('smtp.example')
      return { sendMail }
    })
    sendMail.mockResolvedValue()
  }

  reset()
  return { createTransport, delivery, reset, sendMail }
}
