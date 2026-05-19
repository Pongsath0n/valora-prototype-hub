import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail =
  process.env.OWNER_EMAIL || "pongsathon.officialwork@gmail.com";
const ownerPassword = process.env.OWNER_PASSWORD;

if (!url || !serviceRoleKey || !ownerPassword) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OWNER_PASSWORD"
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function findUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    throw error;
  }

  return data.users.find((user) => user.email === email);
}

async function seedOwner() {
  // 1. Find or create auth user
  let user = await findUserByEmail(ownerEmail);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
    });

    if (error) {
      throw error;
    }

    user = data.user;
  } else {
    console.log(`Auth user already exists: ${ownerEmail}`);
  }

  if (!user?.id) {
    throw new Error("User creation or lookup failed");
  }

  // 2. Find Brewway store
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name")
    .eq("name", "Brewway")
    .single();

  if (storeError) {
    throw new Error(
      `Brewway store not found. Please run database seed first. ${storeError.message}`
    );
  }

  // 3. Upsert owner profile
  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      store_id: store.id,
      email: ownerEmail,
      full_name: "Pongsathon Pookduang",
      role: "owner",
    },
    {
      onConflict: "id",
    }
  );

  if (profileErr) {
    throw profileErr;
  }

  console.log(`Seeded owner user: ${ownerEmail}`);
  console.log(`Role: owner`);
  console.log(`Store: ${store.name}`);
}

seedOwner().catch((error) => {
  console.error("Seed owner failed:", error);
  process.exit(1);
});