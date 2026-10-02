import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN, api, login, makeWorld, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

describe('password login', () => {
  it('accepts email (admin panel / enterprise app) and email-or-mobile identifier (client app)', async () => {
    const w = await makeWorld()
    assert.ok(await login(ADMIN))
    assert.ok(await login({ identifier: w.clientEmail, password: w.clientPassword }))
    assert.ok(await login({ identifier: `+91 ${w.clientMobile}`, password: w.clientPassword }))
    assert.equal(await login({ identifier: w.clientEmail, password: 'wrong-password' }), undefined)
  })

  it('flags admin-issued passwords for replacement', async () => {
    const w = await makeWorld()
    const me = (await api('GET', '/auth/me', w.user)).data.user
    assert.equal(me.mustChangePassword, true)
  })
})

describe('OTP login', () => {
  it('logs in with a single-use 6-digit code', async () => {
    const w = await makeWorld()
    const req = await api('POST', '/auth/otp/request', null, { identifier: w.clientEmail, purpose: 'login' })
    assert.equal(req.status, 200)
    assert.equal(req.data.channel, 'email')
    assert.match(req.data.devCode, /^\d{6}$/)

    const ok = await api('POST', '/auth/otp/verify', null, { identifier: w.clientEmail, code: req.data.devCode })
    assert.equal(ok.status, 200)
    assert.ok(ok.data.accessToken)
    const again = await api('POST', '/auth/otp/verify', null, { identifier: w.clientEmail, code: req.data.devCode })
    assert.equal(again.status, 401)
  })

  it('does not reveal whether an account exists', async () => {
    const r = await api('POST', '/auth/otp/request', null, { identifier: 'nobody@nowhere.dev', purpose: 'login' })
    assert.equal(r.status, 200)
    assert.equal(r.data.devCode, undefined)
  })

  it('throttles resends and burns a code after 5 wrong attempts', async () => {
    const w = await makeWorld()
    const { devCode } = (await api('POST', '/auth/otp/request', null, { identifier: w.clientEmail, purpose: 'login' })).data
    assert.equal((await api('POST', '/auth/otp/request', null, { identifier: w.clientEmail, purpose: 'login' })).status, 429)
    const wrong = devCode === '123456' ? '654321' : '123456'
    for (let i = 0; i < 5; i++) await api('POST', '/auth/otp/verify', null, { identifier: w.clientEmail, code: wrong })
    assert.equal((await api('POST', '/auth/otp/verify', null, { identifier: w.clientEmail, code: devCode })).status, 401)
  })
})

describe('forgot password', () => {
  it('resets via SMS code → single-use reset token', async () => {
    const w = await makeWorld()
    const req = await api('POST', '/auth/otp/request', null, { identifier: w.clientMobile, purpose: 'reset' })
    assert.equal(req.data.channel, 'sms')

    // a reset code can't be used to log in
    assert.equal((await api('POST', '/auth/otp/verify', null, { identifier: w.clientEmail, code: req.data.devCode })).status, 401)

    const { resetToken } = (await api('POST', '/auth/password/verify-otp', null, { identifier: w.clientEmail, code: req.data.devCode })).data
    assert.equal((await api('POST', '/auth/password/reset', null, { resetToken, newPassword: 'short' })).status, 400)
    assert.equal((await api('POST', '/auth/password/reset', null, { resetToken, newPassword: 'NewPassword9' })).status, 200)
    assert.equal((await api('POST', '/auth/password/reset', null, { resetToken, newPassword: 'Another99x' })).status, 401)

    const token = await login({ identifier: w.clientEmail, password: 'NewPassword9' })
    assert.ok(token)
    assert.equal((await api('GET', '/auth/me', token)).data.user.mustChangePassword, false)
    assert.equal(await login({ identifier: w.clientEmail, password: w.clientPassword }), undefined)
  })
})

describe('change password', () => {
  it('replaces the password and revokes existing sessions', async () => {
    const w = await makeWorld()
    const first = await api('POST', '/auth/login', null, { identifier: w.clientEmail, password: w.clientPassword })
    const r = await api('POST', '/auth/change-password', w.user, { currentPassword: w.clientPassword, newPassword: 'Brand-New-99' })
    assert.equal(r.status, 200)
    const refreshed = await api('POST', '/auth/refresh', null, { refreshToken: first.data.refreshToken })
    assert.equal(refreshed.status, 401)
    assert.ok(await login({ identifier: w.clientEmail, password: 'Brand-New-99' }))
  })
})