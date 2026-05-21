import { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import FormField from "@/components/shared/FormField";
import { storeAdminApi, type ApiChannelPrice, type ApiSalesChannel, type ChannelPricingPayload, type ProductSummary } from "@/services/storeAdminApi";

type PriceForm = { id?: string; productId: string; channelId: string; price: string };
const emptyForm: PriceForm = { productId: "", channelId: "", price: "0" };

export default function StoreAdminChannelPricingPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [channels, setChannels] = useState<ApiSalesChannel[]>([]);
  const [prices, setPrices] = useState<ApiChannelPrice[]>([]);
  const [form, setForm] = useState<PriceForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const activeProducts = useMemo(() => products.filter((p) => p.is_active ?? true), [products]);
  const activeChannels = useMemo(() => channels.filter((c) => c.is_active ?? true), [channels]);

  const priceByProductChannel = useMemo(() => {
    return prices.reduce<Record<string, Record<string, ApiChannelPrice>>>((acc, row) => {
      if (!acc[row.product_id]) acc[row.product_id] = {};
      acc[row.product_id][row.channel_id] = row;
      return acc;
    }, {});
  }, [prices]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const data = await storeAdminApi.listChannelPricing();
      setProducts(data.products || []);
      setChannels(data.channels || []);
      setPrices(data.items || []);
    } catch (err: any) {
      setError(err?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setError("");
  };

  const handleSubmit = async () => {
    setError("");
    const priceNum = Number(form.price);
    if (!form.productId || !form.channelId) return setError("กรุณาเลือกเมนูและช่องทาง");
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("กรุณากรอกราคาให้ถูกต้อง (>= 0)");

    const payload: ChannelPricingPayload = {
      product_id: form.productId,
      channel_id: form.channelId,
      price: priceNum,
    };

    try {
      if (form.id) {
        await storeAdminApi.updateChannelPrice(form.id, payload);
        setInfo("อัปเดตราคาแล้ว");
      } else {
        await storeAdminApi.createChannelPrice(payload);
        setInfo("ตั้งราคาเรียบร้อย");
      }
      setShowForm(false);
      resetForm();
      void refresh();
    } catch (err: any) {
      const reason = err?.message || "บันทึกไม่สำเร็จ";
      if (reason === "channel_price_exists") setError("ตั้งราคาซ้ำสำหรับเมนู/ช่องทางนี้แล้ว");
      else if (reason === "unauthorized" || reason === "missing_token") setError("ต้องเข้าสู่ระบบก่อนใช้งาน");
      else setError(reason);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    try {
      const result = await storeAdminApi.deleteChannelPrice(id);
      setInfo(result.status === "deleted" ? "ลบราคาแล้ว" : result.status);
    } catch (err: any) {
      const msg = err?.message || "ลบไม่สำเร็จ";
      if (msg === "channel_price_has_history") setInfo("ไม่สามารถลบได้ มีประวัติออเดอร์");
      else setError(msg);
    }
    void refresh();
  };

  return (
    <AdminLayout title="ราคาตามช่องทาง" subtitle="กำหนดราคาขายและกำไรต่อช่องทาง">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4" /> เพิ่มราคา
        </button>
        {info ? <span className="text-xs text-foreground/80 bg-muted px-2 py-1 rounded">{info}</span> : null}
        {refreshing ? <span className="text-xs text-muted-foreground">กำลังโหลด...</span> : null}
      </div>

      {showForm ? (
        <div className="stat-card space-y-3 mb-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-title text-base">{form.id ? "แก้ไขราคา" : "ตั้งราคาช่องทาง"}</h2>
            <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => { setShowForm(false); resetForm(); }}>
              ปิดฟอร์ม
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <FormField label="เมนู">
              <select
                className="form-input"
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
              >
                <option value="">-- เลือกเมนู --</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="ช่องทาง">
              <select
                className="form-input"
                value={form.channelId}
                onChange={(e) => setForm({ ...form, channelId: e.target.value })}
              >
                <option value="">-- เลือกช่องทาง --</option>
                {activeChannels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="ราคา (฿)">
              <input
                type="number"
                className="form-input"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </FormField>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-semibold"
              onClick={handleSubmit}
            >
              {form.id ? "บันทึกการแก้ไข" : "เพิ่มราคา"}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded border text-sm"
              onClick={() => { setShowForm(false); resetForm(); }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}

      <div className="stat-card overflow-x-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-title">ราคาต่อช่องทาง</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>สินค้า: {activeProducts.length}</span>
            <span>ช่องทาง: {activeChannels.length}</span>
          </div>
        </div>
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th className="w-48">เมนู</th>
              {activeChannels.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
              <th className="w-28">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {activeProducts.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                {activeChannels.map((c) => {
                  const priceRow = priceByProductChannel[p.id]?.[c.id];
                  return (
                    <td key={c.id} className="text-center">
                      {priceRow ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm underline"
                          onClick={() => {
                            setForm({ id: priceRow.id, productId: p.id, channelId: c.id, price: String(priceRow.price) });
                            setShowForm(true);
                          }}
                        >
                          ฿{priceRow.price}
                          <Edit3 className="w-3 h-3" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline"
                          onClick={() => {
                            setForm({ productId: p.id, channelId: c.id, price: "0" });
                            setShowForm(true);
                          }}
                        >
                          ยังไม่ได้ตั้งราคา
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="text-center">
                  <div className="flex flex-col gap-1 items-center">
                    {activeChannels.map((c) => {
                      const priceRow = priceByProductChannel[p.id]?.[c.id];
                      return priceRow ? (
                        <button
                          key={priceRow.id}
                          type="button"
                          className="text-xs text-destructive inline-flex items-center gap-1"
                          onClick={() => handleDelete(priceRow.id)}
                        >
                          <Trash2 className="w-3 h-3" /> ลบ {c.name}
                        </button>
                      ) : null;
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className="text-sm text-muted-foreground mt-3">กำลังโหลด...</p> : null}
        {!loading && activeProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">ยังไม่มีเมนูหรือช่องทางที่เปิดใช้งาน</p>
        ) : null}
        {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
      </div>
    </AdminLayout>
  );
}
