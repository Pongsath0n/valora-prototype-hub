import { afterEach, describe, expect, it, vi } from "vitest";

import { customerApi, type CustomerMenuItem } from "../customerApi";

const baseMenuItem: CustomerMenuItem = {
  id: "menu-1",
  name: "อเมริกาโน่",
  description: "เข้ม หอม",
  image_url: null,
  price: 85,
  category: "กาแฟ",
  available: true,
  allow_sweetness: true,
  default_sweetness: 100,
  addons: [],
};

function mockFetchResponse(payload: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as Response,
    ),
  );
}

describe("customerApi.listMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns items when backend responds with an envelope", async () => {
    mockFetchResponse({ items: [baseMenuItem], store_id: "store-123" });
    const menus = await customerApi.listMenu();
    expect(menus).toHaveLength(1);
    expect(menus[0]).toMatchObject({ id: "menu-1", name: "อเมริกาโน่" });
  });

  it("filters by availability and supports legacy array responses", async () => {
    const payload: CustomerMenuItem[] = [
      baseMenuItem,
      { ...baseMenuItem, id: "menu-2", name: "ลาเต้", available: false },
    ];
    mockFetchResponse(payload);
    const menus = await customerApi.listMenu();
    expect(menus).toHaveLength(1);
    expect(menus[0].id).toBe("menu-1");
  });
});
