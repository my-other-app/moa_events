/**
 * The developer docs' code: what the pages show, as it is. The signature
 * checks (Node, Python, PHP) and the PKCE helpers are run by the tests
 * (src/developers/examples.test.js) against the known values below, so the
 * code people copy is code that works.
 */

/** A webhook as we sign it: a test vector anyone can check their code against. */
export const SIGNATURE_VECTOR = {
  secret: "whsec_5mJqT2vX8kLr4nYc7HdW1pZa",
  timestamp: 1794458702,
  body: '{"id":"evt_01JD3K7Q2M8V4XQ9T6B1N5R2C7","type":"checkin.created","created_at":"2026-11-12T10:15:02+05:30","livemode":false,"club_id":"311","origin":{"type":"app"},"data":{"object":{"id":"90211","object":"checkin","registration_id":"120394","event_id":"8812","checked_in_at":"2026-11-12T10:15:01+05:30","scanned_at":"2026-11-12T10:15:01+05:30","gate":"Main gate","via":"app","duplicate":false,"livemode":false,"updated_at":"2026-11-12T10:15:01+05:30"}}}',
  signature: "f9908e9dab715c61435d1b2f0b7a70989a9190cc05d18fc5a25e50b985c26bf2",
};
export const SIGNATURE_HEADER = `t=${SIGNATURE_VECTOR.timestamp},v1=${SIGNATURE_VECTOR.signature}`;

/** RFC 7636's own example, for the PKCE helpers. */
export const PKCE_VECTOR = { verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" };

export const VERIFY_NODE = `// verify-moa-signature.mjs: Node 18 or newer, no packages needed.
import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

/**
 * True when \`header\` (the MOA-Signature header) signs \`rawBody\` (the body
 * exactly as it arrived: a Buffer or string, never re-encoded JSON) with
 * \`secret\` (your endpoint's whsec_…), and was made in the last five minutes.
 */
export function verifyMoaSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  let timestamp = null;
  const signatures = [];
  for (const part of String(header ?? "").split(",")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || !/^\\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(\`\${timestamp}.\`).update(rawBody).digest();
  return signatures.some((signature) => /^[0-9a-f]{64}$/i.test(signature) && timingSafeEqual(expected, Buffer.from(signature, "hex")));
}
`;

export const VERIFY_NODE_USE = `// An Express route. express.raw keeps the body as it arrived: the signature is over those bytes.
import express from "express";
import { verifyMoaSignature } from "./verify-moa-signature.mjs";

const app = express();

app.post("/hooks/myotherapp", express.raw({ type: "application/json" }), async (req, res) => {
  if (!verifyMoaSignature(req.body, req.get("MOA-Signature"), process.env.MOA_WEBHOOK_SECRET)) {
    return res.status(400).send("Bad signature");
  }
  const webhook = JSON.parse(req.body.toString("utf8"));
  res.sendStatus(200); // answer first (within 10 seconds), then do the work

  if (await alreadyHandled(webhook.id)) return; // MOA-Event-Id: we may send one more than once
  await handle(webhook); // your code: look at webhook.type and webhook.data.object
});
`;

export const VERIFY_PYTHON = `# verify_moa_signature.py: Python 3.8 or newer, standard library only.
import hashlib
import hmac
import re
import time

TOLERANCE_SECONDS = 5 * 60


def verify_moa_signature(raw_body: bytes, header, secret: str, now=None) -> bool:
    """True when header (the MOA-Signature header) signs raw_body (the body
    exactly as it arrived, as bytes) with secret (your endpoint's whsec_...),
    and was made in the last five minutes."""
    timestamp = None
    signatures = []
    for part in (header or "").split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t":
            timestamp = value
        elif key == "v1" and value:
            signatures.append(value)
    if not timestamp or not re.fullmatch(r"[0-9]+", timestamp) or not signatures:
        return False
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > TOLERANCE_SECONDS:
        return False

    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(
        re.fullmatch(r"[0-9a-fA-F]{64}", signature) and hmac.compare_digest(expected, signature.lower())
        for signature in signatures
    )
`;

export const VERIFY_PYTHON_USE = `# A Flask view. request.get_data() is the body as it arrived.
import json
import os

from flask import Flask, request

from verify_moa_signature import verify_moa_signature

app = Flask(__name__)


@app.post("/hooks/myotherapp")
def myotherapp_webhook():
    raw_body = request.get_data()
    if not verify_moa_signature(raw_body, request.headers.get("MOA-Signature"), os.environ["MOA_WEBHOOK_SECRET"]):
        return "Bad signature", 400
    webhook = json.loads(raw_body)
    if not already_handled(webhook["id"]):  # MOA-Event-Id: we may send one more than once
        queue_for_later(webhook)  # your code: answer within 10 seconds, do the work after
    return "", 200
`;

export const VERIFY_PHP = `<?php
// verify_moa_signature.php: PHP 7.4 or newer, no packages needed.

const MOA_TOLERANCE_SECONDS = 300;

/**
 * True when $header (the MOA-Signature header) signs $rawBody (the body
 * exactly as it arrived) with $secret (your endpoint's whsec_...), and was
 * made in the last five minutes.
 */
function verify_moa_signature(string $rawBody, ?string $header, string $secret, ?int $now = null): bool
{
    $timestamp = null;
    $signatures = [];
    foreach (explode(',', $header ?? '') as $part) {
        $pair = explode('=', $part, 2);
        if (count($pair) !== 2) {
            continue;
        }
        $key = trim($pair[0]);
        $value = trim($pair[1]);
        if ($key === 't') {
            $timestamp = $value;
        } elseif ($key === 'v1' && $value !== '') {
            $signatures[] = $value;
        }
    }
    if ($timestamp === null || !preg_match('/\\A[0-9]+\\z/', $timestamp) || count($signatures) === 0) {
        return false;
    }
    $now = $now ?? time();
    if (abs($now - (int) $timestamp) > MOA_TOLERANCE_SECONDS) {
        return false;
    }

    $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
    foreach ($signatures as $signature) {
        if (preg_match('/\\A[0-9a-fA-F]{64}\\z/', $signature) && hash_equals($expected, strtolower($signature))) {
            return true;
        }
    }
    return false;
}
`;

export const VERIFY_PHP_USE = `<?php
// webhook.php: php://input is the body as it arrived.
require __DIR__ . '/verify_moa_signature.php';

$rawBody = file_get_contents('php://input');
$header = $_SERVER['HTTP_MOA_SIGNATURE'] ?? null;

if (!verify_moa_signature($rawBody, $header, getenv('MOA_WEBHOOK_SECRET'))) {
    http_response_code(400);
    exit('Bad signature');
}

$webhook = json_decode($rawBody, true);
if (!already_handled($webhook['id'])) { // MOA-Event-Id: we may send one more than once
    queue_for_later($webhook);           // your code: answer within 10 seconds, do the work after
}
http_response_code(200);
`;

export const PKCE_NODE = `// pkce.mjs: a verifier to keep, and the challenge to send.
import { createHash, randomBytes } from "node:crypto";

export const pkceChallenge = (verifier) => createHash("sha256").update(verifier).digest("base64url");

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url"); // 43 characters
  return { verifier, challenge: pkceChallenge(verifier) };
}
`;

export const PKCE_PYTHON = `# pkce.py: a verifier to keep, and the challenge to send.
import base64
import hashlib
import secrets


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def new_pkce():
    verifier = secrets.token_urlsafe(32)  # 43 characters
    return verifier, pkce_challenge(verifier)
`;

/** The quick start's calls, for an API at `base`. */
export function quickStart(base) {
  return {
    env: `export MOA_KEY=moa_test_...            # your test key, from Settings → Integrations
export MOA_API=${base}`,
    me: `curl $MOA_API/me \\
  -H "Authorization: Bearer $MOA_KEY"`,
    meAnswer: `{
  "type": "api_key",
  "club": { "id": "311", "name": "Circuit Society", "slug": "circuit-society" },
  "partner": null,
  "scopes": ["events:read", "events:write", "events:publish", "registrations:read",
             "registrations:write", "checkins:write", "webhooks:manage"],
  "livemode": false,
  "rate_limit": { "read_per_min": 600, "write_per_min": 120 }
}`,
    createEvent: `curl -X POST $MOA_API/events \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "name": "Hack Night 04",
    "starts_at": "2026-12-05T18:00:00+05:30",
    "ends_at": "2026-12-06T06:00:00+05:30",
    "venue": { "name": "Maker Village", "city": "Kochi" },
    "capacity": 120,
    "external_id": "erp-ev-2026-114"
  }'`,
    createEventAnswer: `{
  "object": "event",
  "id": "8812",
  "club_id": "311",
  "name": "Hack Night 04",
  "slug": "hack-night-04",
  "status": "draft",
  "price": null,
  "registrations_count": 0,
  "livemode": false,
  "public_url": null,
  "updated_at": "2026-11-12T10:02:11+05:30",
  ...
}`,
    publish: `curl -X POST $MOA_API/events/8812/publish \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Idempotency-Key: $(uuidgen)"`,
    register: `curl -X POST $MOA_API/events/8812/registrations \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "person": { "name": "Asha Rao", "email": "asha.rao@example.com" },
    "answers": { "college": "CUSAT" },
    "external_id": "erp-reg-55102"
  }'`,
    registerAnswer: `{
  "object": "registration",
  "id": "120394",
  "event_id": "8812",
  "status": "confirmed",
  "ticket": { "code": "MOA-7K2P-QX9D", "qr_url": "https://api.myotherapp.in/partner/v1/tickets/MOA-7K2P-QX9D/qr.png?sig=…", "status": "valid" },
  "payment": { "status": "not_required", "amount": 0, "currency": "INR" },
  "checked_in_at": null,
  "external_id": "erp-reg-55102",
  "livemode": false,
  ...
}`,
    checkin: `curl -X POST $MOA_API/checkins \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{ "ticket_code": "MOA-7K2P-QX9D", "gate": "Main gate" }'`,
    checkinAnswer: `{
  "id": "90211",
  "object": "checkin",
  "registration_id": "120394",
  "event_id": "8812",
  "checked_in_at": "2026-12-05T18:04:31+05:30",
  "gate": "Main gate",
  "via": "api",
  "duplicate": false,
  "livemode": false,
  ...
}`,
    endpoint: `curl -X POST $MOA_API/webhook-endpoints \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "url": "https://your-app.example.com/hooks/myotherapp",
    "events": ["registration.created", "registration.cancelled", "checkin.created"]
  }'`,
    endpointAnswer: `{
  "id": "4b7e2c1a-9f3d-4e6b-8a52-0c1d2e3f4a5b",
  "url": "https://your-app.example.com/hooks/myotherapp",
  "events": ["registration.created", "registration.cancelled", "checkin.created"],
  "include_own_changes": false,
  "livemode": false,
  "enabled": true,
  "secret": "whsec_5mJqT2vX8kLr4nYc7HdW1pZa",
  ...
}`,
    test: `curl -X POST $MOA_API/webhook-endpoints/4b7e2c1a-9f3d-4e6b-8a52-0c1d2e3f4a5b/test \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Idempotency-Key: $(uuidgen)"`,
    testAnswer: `{
  "ok": true,
  "delivery": { "event_type": "webhook.test", "status": "succeeded", "response_status": 200, ... }
}`,
    received: `POST /hooks/myotherapp HTTP/1.1
Content-Type: application/json
MOA-Event-Id: evt_01JD3K7Q2M8V4XQ9T6B1N5R2C7
MOA-Event-Type: checkin.created
MOA-Delivery-Id: 9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d
MOA-Delivery-Attempt: 1
MOA-Signature: t=1794458702,v1=f9908e9dab715c61435d1b2f0b7a70989a9190cc05d18fc5a25e50b985c26bf2

{"id":"evt_01JD3K7Q2M8V4XQ9T6B1N5R2C7","type":"checkin.created","created_at":"2026-11-12T10:15:02+05:30","livemode":false,"club_id":"311","origin":{"type":"app"},"data":{"object":{"id":"90211","object":"checkin",...}}}`,
  };
}

/** The partner OAuth calls, for the API's addresses. */
export function oauthExamples(api) {
  return {
    authorize: `${api.authorizeUrl}
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https%3A%2F%2Fyour-app.example.com%2Fmyotherapp%2Fcallback
  &scope=events%3Aread%20events%3Awrite%20registrations%3Aread
  &state=RANDOM_STATE_YOU_KEEP
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256`,
    callback: `https://your-app.example.com/myotherapp/callback?code=CODE_FROM_US&state=RANDOM_STATE_YOU_KEEP`,
    exchange: `curl -X POST ${api.tokenUrl} \\
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \\
  -d grant_type=authorization_code \\
  -d code=CODE_FROM_US \\
  -d redirect_uri=https://your-app.example.com/myotherapp/callback \\
  -d code_verifier=THE_VERIFIER_YOU_KEPT`,
    tokens: `{
  "access_token": "…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "…",
  "scope": "events:read events:write registrations:read"
}`,
    refresh: `curl -X POST ${api.refreshUrl} \\
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \\
  -d grant_type=refresh_token \\
  -d refresh_token=THE_LATEST_REFRESH_TOKEN`,
    revoke: `curl -X POST ${api.revokeUrl} \\
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \\
  -d token=THE_REFRESH_TOKEN`,
    appToken: `curl -X POST ${api.tokenUrl} \\
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \\
  -d grant_type=client_credentials \\
  -d scope=clubs:create`,
    appTokenForClub: `curl ${api.baseUrl}/events \\
  -H "Authorization: Bearer $MOA_APP_TOKEN" \\
  -H "MOA-Club-Id: 311"`,
  };
}

/** Idempotency, shown with a registration. */
export function idempotencyExample(base) {
  return `KEY=$(uuidgen)   # make the key once, before the first try

curl -X POST ${base}/events/8812/registrations \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $KEY" \\
  -d '{ "person": { "name": "Asha Rao", "email": "asha.rao@example.com" } }'

# The connection dropped before the answer came? Send exactly the same request, same key:
# you get the first answer back, and Asha is registered once.`;
}

/** Changing safely with ETag and If-Match. */
export function etagExample(base) {
  return `curl -i ${base}/events/8812 -H "Authorization: Bearer $MOA_KEY"
# HTTP/1.1 200 OK
# ETag: "e-8812-1762922140"

curl -X PATCH ${base}/events/8812 \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Content-Type: application/json" \\
  -H 'If-Match: "e-8812-1762922140"' \\
  -d '{ "capacity": 150 }'
# 200: changed. 412 PRECONDITION_FAILED: someone changed it since; read it again and decide.`;
}

/** Catching up with updated_since. */
export function updatedSinceExample(base) {
  return `curl "${base}/events/8812/registrations?updated_since=2026-11-12T10:00:00%2B05:30&limit=100" \\
  -H "Authorization: Bearer $MOA_KEY"
# {"data": [...], "next_cursor": "eyJpZCI6IjEyMDM5NCJ9"}

curl "${base}/events/8812/registrations?updated_since=2026-11-12T10:00:00%2B05:30&limit=100&cursor=eyJpZCI6IjEyMDM5NCJ9" \\
  -H "Authorization: Bearer $MOA_KEY"
# ... until next_cursor is null. Then keep the newest updated_at you saw for next time.`;
}

/** An error, as every one looks. */
export const ERROR_EXAMPLE = `HTTP/1.1 409 Conflict
X-Request-Id: req_7f3a9c1e5b2d4f60

{
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "This is a paid event: people pay on MyOtherApp's checkout, unless the club accepts registrations paid outside MyOtherApp for it.",
    "details": { "checkout_url": "https://myotherapp.in/events/hack-night-04/register" },
    "request_id": "req_7f3a9c1e5b2d4f60"
  }
}`;

/** The rate-limit headers, and a 429. */
export const RATE_LIMIT_EXAMPLE = `HTTP/1.1 200 OK
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1794458760

HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1794458760

{ "error": { "code": "RATE_LIMITED", "message": "Too many write requests this minute. Try again in 12 seconds.", "request_id": "req_..." } }`;

/** A registration paid outside MyOtherApp. */
export function externalPaymentExample(base) {
  return `curl -X POST ${base}/events/8812/registrations \\
  -H "Authorization: Bearer $MOA_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "person": { "name": "Asha Rao", "email": "asha.rao@example.com" },
    "payment": { "status": "paid_externally", "amount": 49900, "currency": "INR", "reference": "COLLEGE-RCPT-20931" }
  }'`;
}

/** A webhook's body. */
export const WEBHOOK_BODY = `{
  "id": "evt_01JD3K7Q2M8V4XQ9T6B1N5R2C7",
  "type": "event.updated",
  "created_at": "2026-11-12T11:20:00+05:30",
  "livemode": true,
  "club_id": "311",
  "origin": { "type": "dashboard" },
  "data": {
    "object": {
      "object": "event",
      "id": "8812",
      "name": "Hack Night 04",
      "capacity": 150,
      "updated_at": "2026-11-12T11:20:00+05:30",
      ...
    },
    "previous": { "capacity": 120, "updated_at": "2026-11-12T10:05:40+05:30" }
  }
}`;
