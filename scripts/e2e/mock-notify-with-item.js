require("dotenv").config({ path: ".env.e2e.local" });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing " + name);
  return value;
}

const cfg = {
  backendBase: requireEnv("E2E_BACKEND_URL").replace(/\/$/, ""),
  supabaseUrl: requireEnv("E2E_SUPABASE_URL").replace(/\/$/, ""),
  anonKey: requireEnv("E2E_SUPABASE_ANON_KEY"),
  email: requireEnv("E2E_EMAIL"),
  password: requireEnv("E2E_PASSWORD"),
};

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  const steps = [];

  const auth = await fetchJson(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  steps.push({ step: "auth", status: auth.status, ok: auth.ok, has_token: Boolean(auth.body && auth.body.access_token) });
  if (!auth.ok || !auth.body?.access_token) {
    console.log(JSON.stringify({ final: "auth_failed", steps }, null, 2));
    process.exit(1);
  }

  const token = auth.body.access_token;
  const headersBase = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const menuResp = await fetchJson(`${cfg.backendBase}/api/store-admin/menus`, {
    headers: headersBase,
  });
  steps.push({ step: "menus", status: menuResp.status, ok: menuResp.ok, count: menuResp.body?.items?.length || 0 });
  const menuItems = Array.isArray(menuResp.body?.items) ? menuResp.body.items : [];
  const envProductId = process.env.E2E_PRODUCT_ID || "";
  let selectedProduct = null;
  if (envProductId) {
    selectedProduct = menuItems.find((item) => item.id === envProductId);
  }
  if (!selectedProduct) {
    selectedProduct = menuItems.find((item) => item.is_active ?? item.available ?? true) || menuItems[0];
  }
  if (!menuResp.ok || !selectedProduct) {
    console.log(
      JSON.stringify(
        {
          final: "product_not_found",
          steps,
          candidates: menuItems.map((item) => ({ id: item.id, name: item.name })),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const envUnitPrice = process.env.E2E_UNIT_PRICE;
  let unitPrice = Number(envUnitPrice);
  if (!envUnitPrice || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    unitPrice = Number(selectedProduct.base_price ?? selectedProduct.price ?? 60) || 60;
  }
  const envUnitCost = process.env.E2E_UNIT_COST;
  let unitCost = Number(envUnitCost);
  if (!envUnitCost || !Number.isFinite(unitCost) || unitCost <= 0) {
    unitCost = Number((unitPrice || 0) * 0.45) || 27;
  }

  const orderPayload = {
    status: "pending_payment",
    payment_status: "unpaid",
    subtotal: unitPrice,
    total_amount: unitPrice,
    total_cost: unitCost,
    gross_profit: unitPrice - unitCost,
    items: [
      {
        product_id: selectedProduct.id,
        quantity: 1,
        unit_price: unitPrice,
        unit_cost: unitCost,
      },
    ],
    note: "mock notify with item",
  };

  const order = await fetchJson(`${cfg.backendBase}/api/store-admin/orders`, {
    method: "POST",
    headers: headersBase,
    body: JSON.stringify(orderPayload),
  });
  steps.push({ step: "create_order", status: order.status, ok: order.ok, body: order.body });
  if (!order.ok || !order.body?.id) {
    console.log(JSON.stringify({ final: "failed", steps }, null, 2));
    process.exit(1);
  }
  const orderId = order.body.id;

  const payment = await fetchJson(`${cfg.backendBase}/api/store-admin/orders/${orderId}/payments`, {
    method: "POST",
    headers: headersBase,
    body: JSON.stringify({ amount: unitPrice, method: "promptpay", slip_url: "mock://slip-e2e" }),
  });
  steps.push({ step: "create_payment", status: payment.status, ok: payment.ok, body: payment.body });
  if (!payment.ok || !payment.body?.id) {
    console.log(JSON.stringify({ final: "failed", steps }, null, 2));
    process.exit(1);
  }
  const paymentId = payment.body.id;

  const approve = await fetchJson(`${cfg.backendBase}/api/store-admin/payments/${paymentId}/approve`, {
    method: "POST",
    headers: headersBase,
    body: JSON.stringify({ note: "mock notify approve" }),
  });
  steps.push({ step: "approve_payment", status: approve.status, ok: approve.ok, body: approve.body });
  if (!approve.ok) {
    console.log(JSON.stringify({ final: "failed", steps }, null, 2));
    process.exit(1);
  }

  const transitions = ["preparing", "ready", "completed"];
  for (const status of transitions) {
    const resp = await fetchJson(`${cfg.backendBase}/api/store-admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: headersBase,
      body: JSON.stringify({ status }),
    });
    steps.push({ step: `status_${status}`, status: resp.status, ok: resp.ok, body: resp.body });
    if (!resp.ok) {
      console.log(JSON.stringify({ final: "failed", steps }, null, 2));
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        final: "ok",
        order_id: orderId,
        payment_id: paymentId,
        steps,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      { final: "script_error", message: err.message, stack: err.stack },
      null,
      2,
    ),
  );
  process.exit(1);
});
