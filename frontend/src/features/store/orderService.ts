import { ingredientService, menuCatalogService, recipeService, type IngredientItem } from "@/features/store/catalogService";

export type OrderStatus = "draft"|"pending_payment"|"paid"|"accepted"|"preparing"|"ready_for_pickup"|"completed"|"cancelled";
export type PaymentStatus = "unpaid"|"pending"|"paid"|"rejected"|"refunded";
export type FeeType = "percent"|"fixed"|"none";

export type SalesChannel = {
  id: string;
  storeId: string;
  name: string;
  feeType: FeeType;
  feeValue: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ChannelPrice = {
  id: string;
  storeId: string;
  menuId: string;
  channelId: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type OrderItemInput = { menuId: string; quantity: number; note?: string };
export type OrderItem = {
  menuId: string; menuName: string; quantity: number; note?: string;
  unitPrice: number; unitCost: number; channelFeePerItem: number; lineAmount: number; lineCost: number; lineFee: number; lineProfit: number;
};
export type Order = {
  id: string; channelId: string; channelName: string; status: OrderStatus; paymentStatus: PaymentStatus; items: OrderItem[];
  totalAmount: number; totalCost: number; totalChannelFee: number; grossProfit: number; createdAt: string;
};


export type CustomerPickupPayload = {
  lineUserId: string;
  lineDisplayName: string;
  phone?: string;
  pickupTime: string;
  orderNote?: string;
};

type StockMovement = { id: string; orderId: string; ingredientId: string; ingredientName: string; quantity: number; movementType: "out"|"restore"; reason: string; createdAt: string };

const K_ORD = "valora:orders:v1";
const K_MOV = "valora:stock_movements:v1";
const K_CHANNEL = "valora:channels:v1";
const K_CH_PRICE = "valora:channel_prices:v1";
const K_CH_PRICE_LIST = "valora:channel_prices_list:v1";

const nowIso = () => new Date().toISOString();
const seedChannels: SalesChannel[] = [
  { id: "c1", storeId: "default_store", name: "Pick-up", feeType: "none", feeValue: 0, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "c2", storeId: "default_store", name: "LINE OA", feeType: "fixed", feeValue: 5, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "c3", storeId: "default_store", name: "Grab", feeType: "percent", feeValue: 30, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "c4", storeId: "default_store", name: "LINE MAN", feeType: "percent", feeValue: 27, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "c5", storeId: "default_store", name: "Shopee Food", feeType: "percent", feeValue: 25, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
];
const seedPrices: ChannelPrice[] = [
  { id: "cp1", storeId: "default_store", menuId: "m1", channelId: "c1", price: 75, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "cp2", storeId: "default_store", menuId: "m2", channelId: "c1", price: 60, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "cp3", storeId: "default_store", menuId: "m1", channelId: "c2", price: 80, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "cp4", storeId: "default_store", menuId: "m2", channelId: "c2", price: 65, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "cp5", storeId: "default_store", menuId: "m1", channelId: "c3", price: 95, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
  { id: "cp6", storeId: "default_store", menuId: "m2", channelId: "c3", price: 79, isActive: true, createdAt: nowIso(), updatedAt: nowIso() },
];

const load=<T,>(k:string,f:T):T=>{ try{const r=localStorage.getItem(k); return r?JSON.parse(r):f;}catch{return f;} };
const save=<T,>(k:string,v:T)=>localStorage.setItem(k,JSON.stringify(v));
const uid=(p:string)=>`${p}_${Date.now()}_${Math.floor(Math.random()*10000)}`;

function loadChannels(): SalesChannel[] {
  return load<SalesChannel[]>(K_CHANNEL, seedChannels);
}

function loadChannelPrices(): ChannelPrice[] {
  const list = load<ChannelPrice[]>(K_CH_PRICE_LIST, []);
  if (list.length > 0) return list;
  // migrate old map seed if present
  const map = load<Record<string, Record<string, number>>>(K_CH_PRICE, {});
  if (Object.keys(map).length > 0) {
    const rows: ChannelPrice[] = [];
    Object.entries(map).forEach(([channelId, menuMap]) => {
      Object.entries(menuMap).forEach(([menuId, price], idx) => {
        rows.push({
          id: uid(`cp${idx}`),
          storeId: "default_store",
          menuId,
          channelId,
          price,
          isActive: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });
    });
    save(K_CH_PRICE_LIST, rows);
    return rows;
  }
  save(K_CH_PRICE_LIST, seedPrices);
  return seedPrices;
}

function saveChannels(channels: SalesChannel[]) {
  save(K_CHANNEL, channels);
}

function saveChannelPrices(rows: ChannelPrice[]) {
  save(K_CH_PRICE_LIST, rows);
}

export const orderService = {
  listChannels(includeInactive = false): SalesChannel[] {
    const all = loadChannels();
    return includeInactive ? all : all.filter((c) => c.isActive);
  },
  listActiveChannels(): SalesChannel[] {
    return loadChannels().filter((c) => c.isActive);
  },
  upsertChannel(input: { id?: string; storeId?: string; name: string; feeType: FeeType; feeValue: number; isActive?: boolean }): SalesChannel {
    const channels = loadChannels();
    const feeType = input.feeType;
    let feeValue = Number.isFinite(input.feeValue) ? Number(input.feeValue) : 0;
    if (feeType === "none") feeValue = 0;
    if (feeType === "percent") feeValue = Math.max(0, Math.min(100, feeValue));
    if (feeType === "fixed") feeValue = Math.max(0, feeValue);

    if (!input.name.trim()) throw new Error("ต้องกรอกชื่อช่องทาง");

    if (input.id) {
      const next = channels.map((c) =>
        c.id === input.id
          ? { ...c, ...input, feeValue, feeType, name: input.name.trim(), isActive: input.isActive ?? c.isActive, updatedAt: nowIso() }
          : c,
      );
      saveChannels(next);
      return next.find((c) => c.id === input.id)!;
    }

    const created: SalesChannel = {
      id: uid("c"),
      storeId: input.storeId ?? "default_store",
      name: input.name.trim(),
      feeType,
      feeValue,
      isActive: input.isActive ?? true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    saveChannels([created, ...channels]);
    return created;
  },
  setChannelActive(id: string, isActive: boolean) {
    const channels = loadChannels();
    saveChannels(channels.map((c) => (c.id === id ? { ...c, isActive, updatedAt: nowIso() } : c)));
  },
  deleteOrDeactivateChannel(id: string): "deleted" | "deactivated" {
    const channels = loadChannels();
    const orders = this.list();
    const hasHistory = orders.some((o) => o.channelId === id);
    if (hasHistory) {
      this.setChannelActive(id, false);
      return "deactivated";
    }
    saveChannels(channels.filter((c) => c.id !== id));
    // remove related prices too
    const prices = loadChannelPrices();
    saveChannelPrices(prices.filter((p) => p.channelId !== id));
    return "deleted";
  },

  listChannelPrices(includeInactive = false): ChannelPrice[] {
    const rows = loadChannelPrices();
    return includeInactive ? rows : rows.filter((r) => r.isActive);
  },
  upsertChannelPrice(input: { id?: string; storeId?: string; menuId: string; channelId: string; price: number; isActive?: boolean }): ChannelPrice {
    if (!input.menuId || !input.channelId) throw new Error("ต้องระบุเมนูและช่องทาง");
    const price = Math.max(0, Number.isFinite(input.price) ? Number(input.price) : 0);
    const rows = loadChannelPrices();
    if (input.id) {
      const next = rows.map((r) =>
        r.id === input.id ? { ...r, price, isActive: input.isActive ?? r.isActive, updatedAt: nowIso() } : r,
      );
      saveChannelPrices(next);
      return next.find((r) => r.id === input.id)!;
    }
    const created: ChannelPrice = {
      id: uid("cp"),
      storeId: input.storeId ?? "default_store",
      menuId: input.menuId,
      channelId: input.channelId,
      price,
      isActive: input.isActive ?? true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    saveChannelPrices([created, ...rows]);
    return created;
  },
  deleteChannelPrice(id: string): "deleted" {
    const rows = loadChannelPrices();
    saveChannelPrices(rows.filter((r) => r.id !== id));
    return "deleted";
  },
  setChannelPriceActive(id: string, isActive: boolean) {
    const rows = loadChannelPrices();
    saveChannelPrices(rows.map((r) => (r.id === id ? { ...r, isActive, updatedAt: nowIso() } : r)));
  },
  list(): Order[] { return load(K_ORD, [] as Order[]); },
  get(id: string): Order | null { return this.list().find(o=>o.id===id) ?? null; },
  listMovements(orderId?: string): StockMovement[] { const all=load(K_MOV, [] as StockMovement[]); return orderId?all.filter(x=>x.orderId===orderId):all; },

  async quote(channelId: string, inputs: OrderItemInput[]) {
    const menus = await menuCatalogService.list();
    const channels = this.listChannels(true);
    const activeChannels = channels.filter((c) => c.isActive);
    const channel = channels.find(c=>c.id===channelId) ?? activeChannels[0] ?? channels[0];
    const priceRows = loadChannelPrices().filter((p) => p.isActive);
    const priceMap = priceRows.reduce<Record<string, Record<string, number>>>((acc, row) => {
      if (!acc[row.channelId]) acc[row.channelId] = {};
      acc[row.channelId][row.menuId] = row.price;
      return acc;
    }, {});
    const channelPrices = channel ? priceMap[channel.id] ?? {} : {};
    const items: OrderItem[] = inputs.map((it) => {
      const menu = menus.find(m=>m.id===it.menuId);
      const price = channelPrices[it.menuId] ?? menu?.basePrice ?? 0;
      const recipe = recipeService.listByMenu(it.menuId);
      const ings = load<IngredientItem[]>("valora:ingredients:v2", []);
      const menuCost = recipe.reduce((s,r)=> s + r.quantityUsed * (ings.find(i=>i.id===r.ingredientId)?.costPerUnit ?? 0), 0);
      const channelFeePerItem = channel.feeType === "percent" ? (price * channel.feeValue)/100 : channel.feeType === "fixed" ? channel.feeValue : 0;
      const lineAmount = price * it.quantity;
      const lineCost = menuCost * it.quantity;
      const lineFee = channelFeePerItem * it.quantity;
      const lineProfit = lineAmount - lineCost - lineFee;
      return { menuId: it.menuId, menuName: menu?.name ?? "Unknown", quantity: it.quantity, note: it.note, unitPrice: price, unitCost: menuCost, channelFeePerItem, lineAmount, lineCost, lineFee, lineProfit };
    });
    return {
      items,
      totalAmount: items.reduce((s,i)=>s+i.lineAmount,0),
      totalCost: items.reduce((s,i)=>s+i.lineCost,0),
      totalChannelFee: items.reduce((s,i)=>s+i.lineFee,0),
      grossProfit: items.reduce((s,i)=>s+i.lineProfit,0),
      channel,
    };
  },

  async createManualOrder(channelId: string, inputs: OrderItemInput[], status: OrderStatus = "accepted", paymentStatus: PaymentStatus = "unpaid") {
    const q = await this.quote(channelId, inputs);
    const ingredients = await ingredientService.list();
    const nextIngredients = ingredients.map(i=>({...i}));
    const movements: StockMovement[] = [];

    if (["accepted","preparing","ready_for_pickup","completed"].includes(status)) {
      for (const item of inputs) {
        const recipe = recipeService.listByMenu(item.menuId);
        for (const rr of recipe) {
          const ing = nextIngredients.find(x=>x.id===rr.ingredientId);
          if (!ing) throw new Error("Ingredient not found");
          const stockUsed = rr.quantityUsed * item.quantity;
          if (ing.currentStock < stockUsed) throw new Error(`Insufficient stock: ${ing.name}`);
          ing.currentStock -= stockUsed;
          movements.push({ id: uid("mov"), orderId: "", ingredientId: ing.id, ingredientName: ing.name, quantity: stockUsed, movementType: "out", reason: "order_deduction", createdAt: new Date().toISOString() });
        }
      }
    }

    const order: Order = { id: uid("ord"), channelId: q.channel.id, channelName: q.channel.name, status, paymentStatus, items: q.items, totalAmount: q.totalAmount, totalCost: q.totalCost, totalChannelFee: q.totalChannelFee, grossProfit: q.grossProfit, createdAt: new Date().toISOString() };
    movements.forEach(m=>m.orderId=order.id);

    save("valora:ingredients:v2", nextIngredients);
    save(K_MOV, [...load(K_MOV, [] as StockMovement[]), ...movements]);
    save(K_ORD, [order, ...this.list()]);
    return order;
  },

  async updateStatus(orderId: string, nextStatus: OrderStatus) {
    const orders = this.list();
    const order = orders.find(o=>o.id===orderId);
    if (!order) throw new Error("Order not found");
    const prev = order.status;
    order.status = nextStatus;

    if (nextStatus === "cancelled" && ["draft","pending_payment","paid","accepted"].includes(prev)) {
      const ingredients = await ingredientService.list();
      const map = ingredients.map(x=>({...x}));
      const restoreMovements: StockMovement[] = [];
      for (const item of order.items) {
        const recipe = recipeService.listByMenu(item.menuId);
        for (const rr of recipe) {
          const ing = map.find(x=>x.id===rr.ingredientId);
          if (!ing) continue;
          const qty = rr.quantityUsed * item.quantity;
          ing.currentStock += qty;
          restoreMovements.push({ id: uid("mov"), orderId: order.id, ingredientId: ing.id, ingredientName: ing.name, quantity: qty, movementType: "restore", reason: "cancel_before_preparing", createdAt: new Date().toISOString() });
        }
      }
      save("valora:ingredients:v2", map);
      save(K_MOV, [...load(K_MOV, [] as StockMovement[]), ...restoreMovements]);
    }

    save(K_ORD, [...orders]);
    return order;
  },
};


export const customerOrderService = {
  async createPickupOrder(channelId: string, inputs: OrderItemInput[], customer: CustomerPickupPayload) {
    const order = await orderService.createManualOrder(channelId, inputs, "pending_payment", "unpaid");
    const enriched: Order & { orderType: string; lineUserId: string; lineDisplayName: string; phone: string | null; pickupTime: string; orderNote: string | null } = { ...order, orderType: "pickup", lineUserId: customer.lineUserId, lineDisplayName: customer.lineDisplayName, phone: customer.phone ?? null, pickupTime: customer.pickupTime, orderNote: customer.orderNote ?? null };
    const all = orderService.list().map((o) => (o.id === order.id ? enriched : o));
    localStorage.setItem("valora:orders:v1", JSON.stringify(all));
    return enriched;
  },
};
