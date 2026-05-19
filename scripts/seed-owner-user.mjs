import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.OWNER_EMAIL || "pongsathon.officialwork@gmail.com";
const ownerPassword = process.env.OWNER_PASSWORD;
if (!url || !serviceRoleKey || !ownerPassword) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OWNER_PASSWORD");

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.auth.admin.createUser({ email: ownerEmail, password: ownerPassword, email_confirm: true });
if (error) throw error;
const userId = data.user?.id;
if (!userId) throw new Error("User creation failed");

const { data: store, error: storeErr } = await supabase.from("stores").select("id,name").ilike("name", "Brewway").limit(1).maybeSingle();
if (storeErr || !store?.id) throw new Error("Brewway store not found");

const { error: profileErr } = await supabase.from("profiles").upsert({ id: userId, email: ownerEmail, role: "owner", store_id: store.id });
if (profileErr) throw profileErr;
console.log(`Seeded owner user: ${ownerEmail} -> store ${store.name}`);
