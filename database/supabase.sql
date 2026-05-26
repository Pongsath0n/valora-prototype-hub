-- WARNING:
-- This file reflects the current real Supabase database schema for Valora/Brewway.
-- It is the single local schema reference/source of truth for development.
-- It is for reference/documentation only.
-- Do not run this file directly against an existing database without review.
-- Table order and constraints may not be valid for execution.

-- Core tables (in alphabetical order)
-- profiles
-- stores
-- store_members
-- product_categories
-- products
-- ingredients
-- recipes
-- sales_channels
-- channel_prices
-- customers
-- orders
-- order_items
-- payments
-- stock_movements
-- order_status_logs
-- payment_status_logs
-- line_notification_logs

-- Enum: order_status
-- Values: pending_payment | waiting_payment_review | accepted | preparing | ready | completed | cancelled

-- Enum: payment_status
-- Values: unpaid | pending_review | paid | rejected | refunded

-- Table: profiles
-- Columns: id (uuid, pk, references auth.users), email (text, unique), full_name (text), role (text/null), store_id (uuid/null), created_at (timestamptz), updated_at (timestamptz)

-- Table: stores
-- Columns: id (uuid, pk), name (text, not null), timezone (text), currency (text), created_at (timestamptz), updated_at (timestamptz)

-- Table: store_members
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), user_id (uuid fk -> profiles), role (store_role enum: owner|manager|staff), created_at (timestamptz), unique(store_id, user_id)

-- Table: product_categories
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), name (text, not null), sort_order (int, default 0), created_at (timestamptz)

-- Table: products
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), category_id (uuid fk -> product_categories, nullable), name (text, not null), sku (text, nullable), is_active (bool, default true), base_price (numeric(12,2) default 0), created_at (timestamptz), updated_at (timestamptz)

-- Table: ingredients
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), name (text, not null), unit (text), cost_per_unit (numeric(12,4) default 0), stock_on_hand (numeric(12,3) default 0), low_stock_threshold (numeric(12,3) default 0), created_at (timestamptz), updated_at (timestamptz)

-- Table: recipes
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), product_id (uuid fk -> products), ingredient_id (uuid fk -> ingredients), quantity_used (numeric(12,4)), created_at (timestamptz), unique(product_id, ingredient_id)

-- Table: sales_channels
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), name (text, not null), type (text), fee_type (channel_fee_type enum: none|percent|fixed), fee_value (numeric(12,4) default 0), is_active (bool), created_at (timestamptz), unique(store_id, name)

-- Table: channel_prices
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), product_id (uuid fk -> products), channel_id (uuid fk -> sales_channels), selling_price (numeric(12,2) not null), created_at (timestamptz), unique(product_id, channel_id)

-- Table: customers
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), name (text), phone (text), line_user_id (text), created_at (timestamptz)

-- Table: orders
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), customer_id (uuid fk -> customers, nullable), channel_id (uuid fk -> sales_channels, nullable),
--          order_type (text/enum), pickup_type (text/enum), pickup_time (timestamptz, nullable),
--          status (order_status enum), payment_status (payment_status enum),
--          subtotal (numeric), discount_amount (numeric), channel_fee (numeric), total_amount (numeric), total_cost (numeric), gross_profit (numeric),
--          note (text), cancelled_reason (text, nullable), cancelled_at (timestamptz, nullable),
--          created_at (timestamptz), updated_at (timestamptz)

-- Table: order_items
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), order_id (uuid fk -> orders), product_id (uuid fk -> products), quantity (int > 0), unit_price (numeric(12,2)), unit_cost (numeric(12,2)), line_total (numeric(12,2)), line_cost (numeric(12,2)), line_profit (numeric(12,2)), created_at (timestamptz)

-- Table: payments
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), order_id (uuid fk -> orders), amount (numeric), method (text), status (payment_status enum),
--          slip_url (text, nullable), slip_file_name (text, nullable), slip_storage_path (text, nullable), submitted_at (timestamptz, nullable),
--          confirmed_by (uuid fk -> profiles, nullable), confirmed_at (timestamptz, nullable), reject_reason (text, nullable),
--          verified_by_api (boolean, nullable), verification_provider (text, nullable), verification_status (text, nullable), verification_score (numeric, nullable), api_response (json/jsonb, nullable),
--          paid_at (timestamptz, nullable), transaction_ref (text, nullable), created_at (timestamptz)

-- Table: stock_movements
-- Columns: id (uuid, pk), store_id (uuid fk -> stores), ingredient_id (uuid fk -> ingredients), order_id (uuid fk -> orders, nullable), movement_type (stock_movement_type enum: in|out|adjustment|restore), quantity (numeric(12,4)), reason (text), created_by (uuid fk -> profiles, nullable), created_at (timestamptz)

-- Table: order_status_logs
-- Columns: id (uuid, pk), order_id (uuid fk -> orders), from_status (order_status enum, nullable), to_status (order_status enum), changed_by (uuid fk -> profiles, nullable), changed_by_type (text), note (text, nullable), created_at (timestamptz)

-- Table: payment_status_logs
-- Columns: id (uuid, pk), payment_id (uuid fk -> payments), order_id (uuid fk -> orders, nullable), from_status (payment_status enum, nullable), to_status (payment_status enum), changed_by (uuid fk -> profiles, nullable), changed_by_type (text), note (text, nullable), created_at (timestamptz)

-- Table: line_notification_logs
-- Columns: id (uuid, pk), order_id (uuid fk -> orders, nullable), customer_id (uuid fk -> customers, nullable), line_user_id (text, nullable), message_type (text), message_payload (json/jsonb/text), send_status (text), error_message (text, nullable), sent_at (timestamptz, nullable), created_at (timestamptz)
