import { resetAllData } from "@/services/mockStorage";

export const DEMO_RESET_CONFIRMATION_PHRASE = "RESET VALORA DEMO";

export interface DemoResetReport {
  clearedKeys: string[];
  timestamp: string;
}

const VALORA_KEY_PREFIX = "valora:";

export function isDemoResetFlagEnabled(flagValue?: string | null): boolean {
  const resolved = flagValue ?? (import.meta.env.VITE_ALLOW_DEMO_DATA_RESET as string | undefined);
  return resolved === "true";
}

export function isDemoResetEnvironmentSafe(mode?: string | null): boolean {
  const resolvedMode = mode ?? (import.meta.env.MODE as string | undefined) ?? "development";
  return resolvedMode !== "production";
}

export function isDemoResetAvailable(options?: { flagEnabled?: boolean; mode?: string | null }): boolean {
  const flag = options?.flagEnabled ?? isDemoResetFlagEnabled();
  const safeEnv = isDemoResetEnvironmentSafe(options?.mode ?? null);
  return flag && safeEnv;
}

export function resetDemoData(): DemoResetReport {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Demo reset is only available in a browser context");
  }

  const clearedKeys: string[] = [];
  const store = window.localStorage;

  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index);
    if (key && key.startsWith(VALORA_KEY_PREFIX)) {
      store.removeItem(key);
      clearedKeys.push(key);
    }
  }

  resetAllData();

  return {
    clearedKeys,
    timestamp: new Date().toISOString(),
  };
}
