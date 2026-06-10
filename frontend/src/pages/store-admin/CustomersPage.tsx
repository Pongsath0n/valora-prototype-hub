import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  storeAdminApi,
  type ApiCustomer,
} from "@/services/storeAdminApi";
import { featureFlags } from "@/config/featureFlags";

function friendlyError(message: string): string {
  if (message === "missing_token" || message === "invalid_token" || message === "unauthorized") {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }
  if (message === "store_access_denied" || message === "no_store_membership" || message === "store_mismatch") {
    return "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้";
  }
  if (message === "insufficient_role") {
    return "สิทธิ์ไม่เพียงพอสำหรับการแก้ไขข้อมูล";
  }
  if (message === "line_user_id_required") {
    return "กรุณากรอก LINE User ID";
  }
  if (message === "duplicate_line_user_id") {
    return "LINE User ID นี้ผูกกับลูกค้าอื่นแล้ว";
  }
  if (message === "line_user_id_already_set") {
    return "ลูกค้านี้มี LINE User ID อยู่แล้ว กรุณาปลดผูกก่อน";
  }
  if (message === "customer_not_found") {
    return "ไม่พบลูกค้า";
  }
  return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}

export default function CustomersPage() {
  const [rows, setRows] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ApiCustomer | null>(null);
  const [lineUserIdInput, setLineUserIdInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const manualBindingEnabled = featureFlags.enableManualLineBinding;

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await storeAdminApi.listCustomers();
      setRows(data.items ?? []);
    } catch (err: any) {
      setError(friendlyError(err?.message || "โหลดข้อมูลไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openBindDialog = (customer: ApiCustomer) => {
    if (!manualBindingEnabled) return;
    setSelectedCustomer(customer);
    setLineUserIdInput("");
    setDialogOpen(true);
    setInfo("");
    setError("");
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedCustomer(null);
    setLineUserIdInput("");
    setError("");
  };

  const handleBind = async () => {
    if (!selectedCustomer) return;
    const raw = lineUserIdInput.trim();
    if (!raw) {
      setError(friendlyError("line_user_id_required"));
      return;
    }
    setSubmitting(true);
    setError("");
    setInfo("");
    try {
      const res = await storeAdminApi.bindLineUser(selectedCustomer.id, raw);
      setInfo(`ผูก LINE สำเร็จ: ${res.line_user_id_masked || "linked"}`);
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err?.message || "request_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnbind = async (customer: ApiCustomer) => {
    if (!window.confirm(`ปลดผูก LINE ของลูกค้า ${customer.name || customer.id}?`)) return;
    setError("");
    setInfo("");
    try {
      await storeAdminApi.unbindLineUser(customer.id);
      setInfo("ปลดผูก LINE สำเร็จ");
      await refresh();
    } catch (err: any) {
      setError(friendlyError(err?.message || "request_failed"));
    }
  };

  return (
    <AdminLayout title="ลูกค้า" subtitle="จัดการข้อมูลลูกค้าและการผูก LINE">
      <div className="space-y-3">
        {!manualBindingEnabled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            การผูก LINE อัตโนมัติจะพร้อมใช้งานหลังจากเปิด flow จับคู่ลูกค้าผ่าน LINE OA / LINE Login ในระยะถัดไป
          </div>
        ) : null}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {info}
          </div>
        )}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">กำลังโหลด...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">ไม่มีข้อมูลลูกค้า</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead>เบอร์โทร</TableHead>
                  <TableHead>สถานะ LINE</TableHead>
                  <TableHead>LINE User ID</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name || "-"}</TableCell>
                    <TableCell>{row.phone || "-"}</TableCell>
                    <TableCell>
                      {row.line_binding_status === "linked" ? (
                        <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100">ผูกแล้ว</Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-500">ยังไม่ผูก</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {row.line_user_id_masked || "-"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {row.line_binding_status === "linked" ? (
                        <Button size="sm" variant="outline" onClick={() => handleUnbind(row)}>
                          ปลดผูก
                        </Button>
                      ) : manualBindingEnabled ? (
                        <Button size="sm" onClick={() => openBindDialog(row)}>
                          ผูก LINE (Testing)
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">รอ flow จับคู่ LINE</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen && manualBindingEnabled} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Testing only: manual LINE User ID binding</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              ลูกค้า: <span className="font-medium">{selectedCustomer?.name || selectedCustomer?.id}</span>
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">LINE User ID</label>
              <Input
                placeholder="Uphase53a_test_xxxxxx"
                value={lineUserIdInput}
                onChange={(e) => setLineUserIdInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleBind(); }}
              />
              <p className="text-xs text-gray-400 mt-1">รองรับค่าทดสอบใน mock mode</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={submitting}>
                ยกเลิก
              </Button>
              <Button onClick={handleBind} disabled={submitting || !lineUserIdInput.trim()}>
                {submitting ? "กำลังดำเนินการ..." : "ผูก LINE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
