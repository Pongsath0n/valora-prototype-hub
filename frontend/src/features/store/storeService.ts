import { storeAdminApi } from "@/services/storeAdminApi";
import { shopService } from "@/services/mockStorage";

export type StoreSetup = {
  id?: string;
  name: string;
  daysOpen: number;
  targetProfit: number;
  timezone?: string;
  currency?: string;
};

const DEFAULT: StoreSetup = {
  name: "Brewway",
  daysOpen: 26,
  targetProfit: 30000,
  timezone: "Asia/Bangkok",
  currency: "THB",
};

export const storeSetupService = {
  async get(): Promise<StoreSetup> {
    try {
      const me = await storeAdminApi.getMe();
      const storeId = me.store_id;
      if (!storeId) return fromMock();

      const base = fromMock();
      return {
        id: storeId,
        name: me.store_name || base.name,
        daysOpen: base.daysOpen,
        targetProfit: base.targetProfit,
        timezone: me.store_timezone ?? "Asia/Bangkok",
        currency: me.store_currency ?? "THB",
      };
    } catch {
      return fromMock();
    }
  },

  async save(payload: StoreSetup): Promise<StoreSetup> {
    // keep compatibility with existing prototype pages that still read mock storage
    shopService.set({
      name: payload.name,
      daysOpen: payload.daysOpen,
      targetProfit: payload.targetProfit,
    });

    try {
      const me = await storeAdminApi.getMe();
      const storeId = me.store_id;
      if (!storeId) return payload;

      // No backend endpoint for store settings update; persist only to mock storage
      return { ...payload, id: storeId };
    } catch {
      return payload;
    }
  },
};

function fromMock(): StoreSetup {
  const shop = shopService.get();
  return {
    name: shop.name || DEFAULT.name,
    daysOpen: shop.daysOpen || DEFAULT.daysOpen,
    targetProfit: shop.targetProfit || DEFAULT.targetProfit,
    timezone: DEFAULT.timezone,
    currency: DEFAULT.currency,
  };
}
