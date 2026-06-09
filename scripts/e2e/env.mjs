#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_LOCAL_BACKEND_URL = "http://127.0.0.1:8000";
const DEFAULT_LOCAL_FRONTEND_URL = "http://localhost:8080";
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

await loadEnvFile(path.join(ROOT_DIR, ".env.e2e.local"));

actionableWarningIfCloudWithLocalDefaults();

function normalizeUrl(value, fallback = "") {
  if (!value) return fallback;
  return value.replace(/\/+$/, "");
}

function ensureDotenv() {
  return import("dotenv").then(({ default: dotenv }) => dotenv).catch(() => null);
}

async function loadEnvFile(filePath) {
  const dotenv = await ensureDotenv();
  if (!dotenv) return;
  if (!existsSync(filePath)) return;
  dotenv.config({ path: filePath, override: false });
}

function actionableWarningIfCloudWithLocalDefaults() {
  if ((process.env.E2E_ENVIRONMENT || "local").toLowerCase() !== "cloud") {
    return;
  }
  if (!process.env.BACKEND_URL && !process.env.E2E_BACKEND_URL) {
    // eslint-disable-next-line no-console
    console.warn("[env] E2E_ENVIRONMENT=cloud but BACKEND_URL not provided. Tests will default to local http://127.0.0.1:8000");
  }
}

function maskToken(token) {
  if (!token) return "missing";
  if (token.length <= 10) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

const ENV = buildEnv();

function buildEnv() {
  const environment = (process.env.E2E_ENVIRONMENT || "local").toLowerCase();
  const backendUrl = normalizeUrl(
    process.env.BACKEND_URL || process.env.E2E_BACKEND_URL || DEFAULT_LOCAL_BACKEND_URL
  );
  const frontendUrl = normalizeUrl(
    process.env.FRONTEND_URL || process.env.E2E_FRONTEND_URL || DEFAULT_LOCAL_FRONTEND_URL
  );
  const ownerToken = process.env.OWNER_TOKEN || "";
  const staffToken = process.env.STAFF_TOKEN || "";
  const adminToken =
    process.env.ADMIN_TOKEN || ownerToken || process.env.E2E_ADMIN_TOKEN || process.env.STAFF_TOKEN || "";
  const storeId = process.env.TEST_STORE_ID || process.env.E2E_STORE_ID || "";
  const productId = process.env.CUSTOMER_PRODUCT_ID || process.env.E2E_PRODUCT_ID || "";

  return {
    environment,
    backendUrl,
    frontendUrl,
    ownerToken,
    staffToken,
    adminToken,
    storeId,
    productId,
    DEFAULT_LOCAL_BACKEND_URL,
    DEFAULT_LOCAL_FRONTEND_URL,
  };
}

function maskedEnvSummary() {
  return {
    BACKEND_URL: ENV.backendUrl || "missing",
    FRONTEND_URL: ENV.frontendUrl || "missing",
    OWNER_TOKEN: ENV.ownerToken ? `present (${maskToken(ENV.ownerToken)})` : "missing",
    STAFF_TOKEN: ENV.staffToken ? `present (${maskToken(ENV.staffToken)})` : "missing",
    ADMIN_TOKEN: ENV.adminToken ? `present (${maskToken(ENV.adminToken)})` : "missing",
    TEST_STORE_ID: ENV.storeId ? "present" : "missing",
    CUSTOMER_PRODUCT_ID: ENV.productId ? "present" : "missing",
    E2E_ENVIRONMENT: ENV.environment,
  };
}

function assertLocalFirstUnlessCloud(context = "local-first policy") {
  if (ENV.environment === "cloud") {
    return;
  }
  const violations = [];
  if (ENV.backendUrl !== ENV.DEFAULT_LOCAL_BACKEND_URL) {
    violations.push(
      `BACKEND_URL must be ${ENV.DEFAULT_LOCAL_BACKEND_URL} for local runs. Update .env.e2e.local or override at runtime.`
    );
  }
  if (ENV.frontendUrl !== ENV.DEFAULT_LOCAL_FRONTEND_URL) {
    violations.push(
      `FRONTEND_URL must be ${ENV.DEFAULT_LOCAL_FRONTEND_URL} for local runs. Update .env.e2e.local or override at runtime.`
    );
  }
  if (violations.length) {
    const error = new Error(`${context}: local-first policy violated.`);
    error.code = "LOCAL_FIRST_VIOLATION";
    error.details = { violations, summary: maskedEnvSummary() };
    throw error;
  }
}

function ensureEnvVars(requiredKeys) {
  const missing = requiredKeys.filter((key) => {
    const value = ENV[key];
    return value === undefined || value === null || value === "";
  });
  if (missing.length) {
    const error = new Error(`Missing required env keys: ${missing.join(", ")}`);
    error.code = "MISSING_ENV";
    error.missing = missing;
    error.summary = maskedEnvSummary();
    throw error;
  }
}

function invalidTokenError(label, response) {
  const error = new Error(`${label} token invalid`);
  error.code = "INVALID_TOKEN";
  error.detail = response;
  return error;
}

export { ENV, maskToken, maskedEnvSummary, assertLocalFirstUnlessCloud, ensureEnvVars, invalidTokenError };
