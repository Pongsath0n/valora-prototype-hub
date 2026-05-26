import { ingredientService, menuCatalogService } from "@/features/store/catalogService";
import { orderService, type Order } from "@/features/store/orderService";

type DateRange = { from?: string; to?: string };

type ReportFilters = DateRange & { channel?: string; menuId?: string };

const inRange = (iso: string, range: DateRange) => {
  const t = new Date(iso).getTime();
  if (range.from && t < new Date(range.from).getTime()) return false;
  if (range.to && t > new Date(range.to).getTime() + 24 * 3600 * 1000 - 1) return false;
  return true;
};

export const dashboardReportService = {
  async getDashboard() {
    const all = orderService.list();
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = all.filter((o) => o.createdAt.slice(0, 10) === today);

    const totals = sumOrders(todayOrders);
    const itemRows = todayOrders.flatMap((o) => o.items.map((i) => ({ ...i, channel: o.channelName })));

    const bestSellerMap = new Map<string, { qty: number; sales: number; profit: number }>();
    itemRows.forEach((i) => {
      const cur = bestSellerMap.get(i.menuName) ?? { qty: 0, sales: 0, profit: 0 };
      cur.qty += i.quantity;
      cur.sales += i.lineAmount;
      cur.profit += i.lineProfit;
      bestSellerMap.set(i.menuName, cur);
    });

    const byMenu = [...bestSellerMap.entries()].map(([menuName, v]) => ({ menuName, ...v })).sort((a, b) => b.qty - a.qty);
    const byProfitMenu = [...bestSellerMap.entries()].map(([menuName, v]) => ({ menuName, ...v })).sort((a, b) => b.profit - a.profit);

    const byChannelMap = new Map<string, { sales: number; profit: number; orders: number }>();
    todayOrders.forEach((o) => {
      const cur = byChannelMap.get(o.channelName) ?? { sales: 0, profit: 0, orders: 0 };
      cur.sales += o.totalAmount;
      cur.profit += o.grossProfit;
      cur.orders += 1;
      byChannelMap.set(o.channelName, cur);
    });
    const byChannel = [...byChannelMap.entries()].map(([channel, v]) => ({ channel, ...v })).sort((a, b) => b.sales - a.sales);

    const ingredients = await ingredientService.list();
    const lowStock = ingredients.filter((i) => i.isActive && i.currentStock <= i.lowStockThreshold);

    return {
      summary: {
        ordersToday: todayOrders.length,
        salesToday: totals.totalSales,
        costToday: totals.totalCost,
        grossProfitToday: totals.grossProfit,
        avgProfitPerCup: totals.totalQty > 0 ? totals.grossProfit / totals.totalQty : 0,
        bestSeller: byMenu[0]?.menuName ?? "-",
        mostProfitableMenu: byProfitMenu[0]?.menuName ?? "-",
        bestChannel: byChannel[0]?.channel ?? "-",
      },
      byMenu,
      byProfitMenu,
      byChannel,
      lowStock,
      recentOrders: todayOrders.slice(0, 10),
    };
  },

  async getReport(filters: ReportFilters) {
    const orders = orderService.list().filter((o) => inRange(o.createdAt, filters));
    const filtered = orders.filter((o) => {
      if (filters.channel && filters.channel !== "ALL" && o.channelName !== filters.channel) return false;
      if (filters.menuId && filters.menuId !== "ALL" && !o.items.some((i) => i.menuId === filters.menuId)) return false;
      return true;
    });

    const totals = sumOrders(filtered);
    const grossMarginPercent = totals.totalSales > 0 ? (totals.grossProfit / totals.totalSales) * 100 : 0;

    return { orders: filtered, totals: { ...totals, grossMarginPercent }, menus: await menuCatalogService.list(), channels: orderService.listChannels() };
  },

  exportReportCsv(orders: Order[]) {
    const header = ["order_id", "date", "channel", "status", "payment_status", "total_amount", "total_cost", "total_channel_fee", "gross_profit"];
    const rows = orders.map((o) => [o.id, o.createdAt, o.channelName, o.status, o.paymentStatus, o.totalAmount.toFixed(2), o.totalCost.toFixed(2), o.totalChannelFee.toFixed(2), o.grossProfit.toFixed(2)]);
    return [header, ...rows].map((r) => r.join(",")).join("\n");
  },
};

function sumOrders(orders: Order[]) {
  const totalSales = orders.reduce((s, o) => s + o.totalAmount, 0);
  const totalCost = orders.reduce((s, o) => s + o.totalCost, 0);
  const grossProfit = orders.reduce((s, o) => s + o.grossProfit, 0);
  const totalQty = orders.reduce((s, o) => s + o.items.reduce((x, i) => x + i.quantity, 0), 0);
  return { totalSales, totalCost, grossProfit, totalQty };
}
