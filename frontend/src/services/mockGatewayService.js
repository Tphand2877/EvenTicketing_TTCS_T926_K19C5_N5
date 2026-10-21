import apiClient from './apiClient'

// ── Mock payment gateway – SCRUM-203 (T-43) ──────────────────────────
// TODO(T-40/T-42): confirm the webhook path, payload fields, signature
// header and signing method with BE2 (Nguyễn Đức Thái). Values below are
// placeholders so the page can be built before the contract is final.
const WEBHOOK_PATH = '/payments/webhook'
const SIGNATURE_HEADER = 'X-Signature'

// Fake key for the mock only. It must match the key the backend uses
// to verify signatures while the mock gateway is enabled.
const MOCK_SECRET = import.meta.env.VITE_MOCK_GATEWAY_SECRET || 'mock-secret'

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

// HMAC-SHA256 of the exact request body. Needs a secure context
// (https or localhost), which is fine for local and staging runs on localhost.
async function sign(body) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(MOCK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
}

/**
 * Send a payment result to the backend like the real gateway would.
 * @param {{ orderId: string, amount: number, status: 'SUCCESS'|'FAILED', transactionId?: string }} result
 */
export const sendMockPaymentResult = async ({ orderId, amount, status, transactionId }) => {
  const payload = {
    transactionId: transactionId || `mock-${crypto.randomUUID()}`,
    orderId,
    amount,
    status,
  }
  // Sign the exact string we send, so the backend can verify the raw body.
  const body = JSON.stringify(payload)
  const signature = await sign(body)

  const { data } = await apiClient.post(WEBHOOK_PATH, body, {
    headers: {
      'Content-Type': 'application/json',
      [SIGNATURE_HEADER]: signature,
    },
    skipAuthRedirect: true,
  })
  return data
}
