/*
 * Phase 5.2 - LINE webhook signature smoke test (local only)
 * - Does NOT send real LINE messages
 * - Uses LINE_CHANNEL_SECRET if present; otherwise expects not_configured response
 */

const crypto = require("crypto");
const fetch = global.fetch || require("node-fetch");
require("dotenv").config({ path: ".env.e2e.local" });
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: "backend/.env" });

const backend = "http://127.0.0.1:8000";
const secret = process.env.LINE_CHANNEL_SECRET || "";

const payload = {
  events: [
    { type: "follow", source: { type: "user", userId: "U123" } },
    { type: "message", source: { type: "user", userId: "U456" }, message: { type: "text", text: "hi" } },
    { type: "postback", source: { type: "user", userId: "U789" }, postback: { data: "action=buy" } },
    { type: "beacon", hwid: "XYZ" },
  ],
};

function sign(body) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

async function call(body, signatureHeader) {
  const res = await fetch(`${backend}/api/line/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signatureHeader ? { "X-Line-Signature": signatureHeader } : {}),
    },
    body,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {}
  return { status: res.status, body: parsed || text };
}

(async () => {
  if (!secret) {
    const body = JSON.stringify(payload);
    const res = await call(body, "invalid");
    console.log(JSON.stringify({ mode: "no_secret", response: res }, null, 2));
    return;
  }

  const body = JSON.stringify(payload);
  const validSig = sign(body);

  const ok = await call(body, validSig);
  const invalid = await call(body, "invalid_signature");
  const missing = await call(body, undefined);

  console.log(
    JSON.stringify(
      {
        mode: "with_secret",
        responses: {
          valid: ok,
          invalid_signature: invalid,
          missing_signature: missing,
        },
      },
      null,
      2
    )
  );
})();
