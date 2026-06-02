export type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

// Mock/dev-only profile for non-LIFF environments.
const MOCK: LiffProfile = {
  userId: "U_mock_001",
  displayName: "Mock Customer",
};

export async function getLiffProfile(): Promise<LiffProfile> {
  const liffId = import.meta.env.VITE_LIFF_ID;
  const enabled = import.meta.env.VITE_LIFF_ENABLED === "true";

  if (!enabled || !liffId || typeof window === "undefined") return MOCK;

  try {
    const liff = (window as any).liff;
    if (!liff) return MOCK;
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) liff.login();
    const p = await liff.getProfile();
    return { userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl };
  } catch {
    return MOCK;
  }
}
