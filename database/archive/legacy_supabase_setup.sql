-- LEGACY / OUTDATED SETUP
-- This file is retained for historical reference only.
-- Do NOT treat this as the current schema. See database/supabase.sql for the real schema reference.
-- ─── VALORA HUB: SUPABASE DATABASE SETUP ──────────────────────────────────────
-- COPY AND PASTE THIS INTO SUPABASE SQL EDITOR TO INITIALIZE YOUR DATABASE

-- 1. ENUMS & TYPES
CREATE TYPE public.plan_id AS ENUM ('free', 'starter', 'pro');
CREATE TYPE public.plan_status AS ENUM ('FREE', 'PENDING', 'ACTIVE', 'EXPIRED');
CREATE TYPE public.invoice_status AS ENUM ('UNPAID', 'PAID', 'EXPIRED');
CREATE TYPE public.submission_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- 2. TABLES

-- Profiles (Linked to Supabase Auth)
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text UNIQUE NOT NULL,
  full_name text,
  plan_id public.plan_id DEFAULT 'free',
  plan_status public.plan_status DEFAULT 'FREE',
  active_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Shops
CREATE TABLE public.shops (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  days_open integer DEFAULT 30 CHECK (days_open > 0 AND days_open <= 31),
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Fixed Costs
CREATE TABLE public.fixed_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  amount numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Menu Items
CREATE TABLE public.menu_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  cost_per_unit numeric(12,2) DEFAULT 0,
  selling_price numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Delivery Platforms
CREATE TABLE public.delivery_platforms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE NOT NULL,
  platform_name text NOT NULL,
  commission_rate numeric(5,2) DEFAULT 0,
  fixed_fee numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Invoices
CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reference_code text UNIQUE NOT NULL,
  amount numeric(12,2) NOT NULL,
  plan_id public.plan_id NOT NULL,
  status public.invoice_status DEFAULT 'UNPAID',
  created_at timestamptz DEFAULT now()
);

-- Payment Submissions
CREATE TABLE public.payment_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  method text NOT NULL, -- 'credit_card', 'promptpay', 'bank_transfer'
  gateway_charge_id text,
  status public.submission_status DEFAULT 'PENDING',
  proof_url text, -- For manual bank transfers
  admin_note text,
  created_at timestamptz DEFAULT now()
);

-- 3. AUTOMATION (TRIGGERS)

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER set_updated_at_shops
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;

-- POLICIES (Example: Users can only see their own data)

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Shops can be managed by owner" ON public.shops
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Fixed costs managed via shop ownership" ON public.fixed_costs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.shops WHERE shops.id = fixed_costs.shop_id AND shops.owner_id = auth.uid())
  );

CREATE POLICY "Menu items managed via shop ownership" ON public.menu_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.shops WHERE shops.id = menu_items.shop_id AND shops.owner_id = auth.uid())
  );

CREATE POLICY "Platforms managed via shop ownership" ON public.delivery_platforms
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.shops WHERE shops.id = delivery_platforms.shop_id AND shops.owner_id = auth.uid())
  );

CREATE POLICY "Invoices viewed by user" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Submissions managed by user" ON public.payment_submissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = payment_submissions.invoice_id AND invoices.user_id = auth.uid())
  );
