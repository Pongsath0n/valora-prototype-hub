export type CustomerIdentitySource = "manual" | "mock_liff" | "future_liff";

export type CustomerIdentity = {
  source: CustomerIdentitySource;
  displayName?: string;
  phone?: string;
  lineUserId?: string;
  lineUserIdMasked?: string | null;
  pictureUrl?: string;
  isLiffReady: boolean;
  canSubmitLineUserId: boolean;
};

const ALLOW_MOCK_LINE_ID_SUBMIT = import.meta.env.VITE_ALLOW_MOCK_LIFF_LINE_ID === "true";
const ALLOW_FUTURE_LINE_ID_SUBMIT = import.meta.env.VITE_ALLOW_FUTURE_LIFF_LINE_ID === "true";

function safeTrim(value?: string | null): string {
  return (value || "").trim();
}

export function maskLineUserId(value?: string | null): string | null {
  const raw = safeTrim(value);
  if (!raw) return null;
  if (raw.length <= 8) return `${raw.slice(0, 2)}...${raw.slice(-2)}`;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

export function isLiffRuntimeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const maybeLiff = (window as any).liff;
  return Boolean(maybeLiff && typeof maybeLiff.getProfile === "function");
}

export function resolveIdentitySource(): CustomerIdentitySource {
  const liffEnabled = import.meta.env.VITE_LIFF_ENABLED === "true";
  const liffId = safeTrim(import.meta.env.VITE_LIFF_ID as string | undefined);
  if (liffEnabled && liffId) return "future_liff";
  return "mock_liff";
}

export function getMockLiffIdentity(): CustomerIdentity {
  const lineUserId = "U_mock_001";
  return {
    source: "mock_liff",
    displayName: "Mock Customer",
    lineUserId,
    lineUserIdMasked: maskLineUserId(lineUserId),
    pictureUrl: undefined,
    isLiffReady: false,
    canSubmitLineUserId: ALLOW_MOCK_LINE_ID_SUBMIT,
  };
}

type ManualIdentityInput = {
  name?: string;
  phone?: string;
  pictureUrl?: string;
};

export function getManualIdentityFromForm(input: ManualIdentityInput): CustomerIdentity {
  return {
    source: "manual",
    displayName: safeTrim(input.name) || undefined,
    phone: safeTrim(input.phone) || undefined,
    lineUserId: undefined,
    lineUserIdMasked: null,
    pictureUrl: input.pictureUrl,
    isLiffReady: false,
    canSubmitLineUserId: false,
  };
}

export async function getCustomerIdentity(): Promise<CustomerIdentity> {
  const source = resolveIdentitySource();

  // Manual-safe default when no LIFF runtime should be used.
  if (source === "mock_liff" && !isLiffRuntimeAvailable()) {
    return getMockLiffIdentity();
  }

  // Future LIFF placeholder (do not import or init LIFF SDK here).
  try {
    const { getLiffProfile } = await import("./liffService");
    const profile = await getLiffProfile();
    const profileUserId = safeTrim((profile as any)?.userId as string | undefined);
    const isMockProfile = profileUserId === "U_mock_001";
    const isReady = source === "future_liff" && isLiffRuntimeAvailable() && import.meta.env.VITE_LIFF_ENABLED === "true";

    if (!profile || isMockProfile || source === "mock_liff") {
      return {
        ...getMockLiffIdentity(),
        displayName: profile?.displayName || getMockLiffIdentity().displayName,
        pictureUrl: profile?.pictureUrl || getMockLiffIdentity().pictureUrl,
      };
    }

    const lineUserIdMasked = maskLineUserId(profileUserId);
    const canSubmitLineUserId = Boolean(
      ALLOW_FUTURE_LINE_ID_SUBMIT && isReady && profileUserId && !isMockProfile,
    );

    return {
      source,
      displayName: profile.displayName,
      phone: undefined,
      lineUserId: profileUserId || undefined,
      lineUserIdMasked,
      pictureUrl: profile.pictureUrl,
      isLiffReady: isReady,
      canSubmitLineUserId,
    };
  } catch {
    return getMockLiffIdentity();
  }
}

export function shouldSubmitLineUserId(identity?: CustomerIdentity | null): boolean {
  if (!identity?.lineUserId) return false;
  if (identity.source === "mock_liff") return Boolean(ALLOW_MOCK_LINE_ID_SUBMIT && identity.canSubmitLineUserId);
  if (identity.source === "future_liff") return Boolean(ALLOW_FUTURE_LINE_ID_SUBMIT && identity.canSubmitLineUserId);
  return false;
}
