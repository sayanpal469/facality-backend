import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

/**
 * Outbound email + SMS. Drivers are chosen by env (see config/env.js):
 * `console` logs the message (development), `smtp` / `twilio` deliver it.
 * Every function resolves to whether delivery succeeded and never throws —
 * a mail outage must not break the request that triggered it.
 */

const cfg = env.messaging
let transporter = null

function smtp() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.secure,
      auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
    })
  }
  return transporter
}

/** True when OTP codes are only logged, so dev responses may echo them. */
export const isConsoleMessaging = cfg.emailDriver === 'console' && cfg.smsDriver === 'console'

export async function sendEmail({ to, subject, text }) {
  if (!to) return false
  try {
    if (cfg.emailDriver === 'smtp') {
      await smtp().sendMail({ from: cfg.smtp.from, to, subject, text })
    } else {
      console.log(`[messaging:email] to=${to} subject="${subject}"\n${text}`)
    }
    return true
  } catch (err) {
    console.error('[messaging] email failed:', err.message)
    return false
  }
}

export function toE164(mobile) {
  const raw = String(mobile || '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) return '+' + raw.replace(/\D/g, '')
  const digits = raw.replace(/\D/g, '')
  return digits.length === 10 ? `${cfg.defaultCountryCode}${digits}` : `+${digits}`
}

export async function sendSms({ to, text }) {
  const number = toE164(to)
  if (!number) return false
  try {
    if (cfg.smsDriver === 'twilio') {
      const { accountSid, authToken, from } = cfg.twilio
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: number, From: from, Body: text }),
      })
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`)
    } else {
      console.log(`[messaging:sms] to=${number}\n${text}`)
    }
    return true
  } catch (err) {
    console.error('[messaging] sms failed:', err.message)
    return false
  }
}

/** Sends a new/reset temporary password to the account holder by email and SMS. */
export async function sendCredentials(user, temporaryPassword, { isNew = false } = {}) {
  const intro = isNew ? `Your ${cfg.appName} account has been created.` : `Your ${cfg.appName} password has been reset.`
  const text = `${intro}\n\nLogin: ${user.email}\nTemporary password: ${temporaryPassword}\n\nYou'll be asked to choose a new password when you first log in.`
  const [email, sms] = await Promise.all([
    sendEmail({ to: user.email, subject: `${cfg.appName} — your login details`, text }),
    user.mobile ? sendSms({ to: user.mobile, text: `${cfg.appName}: login ${user.email}, temporary password ${temporaryPassword}` }) : Promise.resolve(false),
  ])
  return { email, sms }
}
