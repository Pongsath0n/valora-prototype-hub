export const dashboardMock = {
  ordersToday: 48,
  salesToday: 12450,
  costToday: 5320,
  grossProfitToday: 7130,
  avgProfitPerCup: 38,
  bestSeller: "Iced Latte",
  mostProfitable: "Matcha Latte",
  lowStockCount: 3,
  recentOrders: [
    { no: "ORD-1024", channel: "LINE OA", amount: 220, status: "preparing" },
    { no: "ORD-1023", channel: "Pick-up", amount: 145, status: "ready_for_pickup" },
    { no: "ORD-1022", channel: "Grab", amount: 280, status: "completed" },
  ],
  salesByChannel: [
    { name: "Pick-up", sales: 4320, profit: 2820 },
    { name: "LINE OA", sales: 3010, profit: 1820 },
    { name: "Grab", sales: 2700, profit: 1210 },
    { name: "LINE MAN", sales: 1640, profit: 840 },
    { name: "Shopee Food", sales: 780, profit: 440 },
  ],
};
