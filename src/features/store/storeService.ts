import { supabase } from "@/lib/supabase";
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
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return fromMock();

      const { data: membership } = await supabase
        .from("store_members")
        .select("store_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (!membership?.store_id) return fromMock();

      const { data: store } = await supabase
        .from("stores")
        .select("id, name, timezone, currency")
        .eq("id", membership.store_id)
        .single();

      const base = fromMock();
      return {
        id: store.id,
        name: store.name,
        daysOpen: base.daysOpen,
        targetProfit: base.targetProfit,
        timezone: store.timezone ?? "Asia/Bangkok",
        currency: store.currency ?? "THB",
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
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return payload;

      const { data: membership } = await supabase
        .from("store_members")
        .select("store_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (!membership?.store_id) return payload;

      const update = {
        name: payload.name,
        timezone: payload.timezone ?? "Asia/Bangkok",
        currency: payload.currency ?? "THB",
      };

      await supabase.from("stores").update(update).eq("id", membership.store_id);
      return { ...payload, id: membership.store_id };
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
