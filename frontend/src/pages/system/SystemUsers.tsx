import { useCallback, useEffect, useState } from "react";
import SystemLayout from "@/components/system/SystemLayout";
import { FormSelect } from "@/components/ui/form-select";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  systemConsoleApi,
  type SystemRoleId,
  type SystemStoreRow,
  type SystemUserMembership,
  type SystemUserRow,
} from "@/services/systemConsoleService";

const ROLE_OPTIONS: { id: SystemRoleId; label: string }[] = [
  { id: "owner", label: "Owner" },
  { id: "admin", label: "Admin" },
  { id: "manager", label: "Manager" },
  { id: "staff", label: "Staff" },
];

const DEFAULT_ROLE: SystemRoleId = "staff";

type BannerState = { type: "success" | "error"; message: string } | null;

export default function SystemUsersPage() {
  const [rows, setRows] = useState<SystemUserRow[]>([]);
  const [stores, setStores] = useState<SystemStoreRow[]>([]);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<"ok" | "empty" | "error">("empty");
  const [banner, setBanner] = useState<BannerState>(null);

  const [profileRoleDrafts, setProfileRoleDrafts] = useState<Record<string, SystemRoleId>>({});
  const [membershipRoleDrafts, setMembershipRoleDrafts] = useState<Record<string, SystemRoleId>>({});
  const [membershipDrafts, setMembershipDrafts] = useState<Record<string, { storeId: string; role: SystemRoleId }>>({});

  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [creatingForUserId, setCreatingForUserId] = useState<string | null>(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    const [usersResult, storesResult] = await Promise.allSettled([
      systemConsoleApi.listUsers(),
      systemConsoleApi.listStores(),
    ]);

    if (usersResult.status === "fulfilled") {
      const items = usersResult.value.items ?? [];
      setRows(items);
      setState(items.length ? "ok" : "empty");
    } else {
      setState("error");
      setBanner({ type: "error", message: usersResult.reason?.message ?? "โหลดรายชื่อผู้ใช้ไม่สำเร็จ" });
    }

    if (storesResult.status === "fulfilled") {
      setStores(storesResult.value.items ?? []);
      setStoreError(null);
    } else {
      setStores([]);
      setStoreError("ไม่สามารถโหลดรายการร้านได้");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    setProfileRoleDrafts({});
    setMembershipRoleDrafts({});
  }, [rows]);

  const reloadUsers = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await systemConsoleApi.listUsers();
      setRows(res.items);
      setState(res.items.length ? "ok" : "empty");
    } catch (error) {
      const message = error instanceof Error ? error.message : "โหลดข้อมูลผู้ใช้ไม่สำเร็จ";
      setBanner({ type: "error", message });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSaveProfileRole = async (user: SystemUserRow, nextRole: SystemRoleId) => {
    if (user.role === nextRole) {
      return;
    }
    if (user.role === "owner" && nextRole !== "owner") {
      const confirmed = window.confirm("คุณกำลังลดสิทธิ์ Owner ของผู้ใช้นี้ ยืนยันหรือไม่?");
      if (!confirmed) {
        return;
      }
    }
    setSavingProfileId(user.id);
    setBanner(null);
    try {
      await systemConsoleApi.updateUserRole(user.id, nextRole);
      setBanner({ type: "success", message: "อัปเดตสิทธิ์ระบบสำเร็จ" });
      await reloadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถอัปเดตสิทธิ์ได้";
      setBanner({ type: "error", message });
    } finally {
      setSavingProfileId(null);
    }
  };

  const handleMembershipRoleChange = async (member: SystemUserMembership, nextRole: SystemRoleId) => {
    if (member.role === nextRole) {
      return;
    }
    if (member.role === "owner" && nextRole !== "owner") {
      const confirmed = window.confirm("การลดสิทธิ์ Owner ของร้านนี้จะทำให้เหลือ Owner พอหรือไม่? ยืนยันดำเนินการ");
      if (!confirmed) {
        return;
      }
    }
    setSavingMemberId(member.id);
    setBanner(null);
    try {
      await systemConsoleApi.updateStoreMember(member.id, nextRole);
      setBanner({ type: "success", message: "อัปเดตสิทธิ์ร้านสำเร็จ" });
      await reloadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถอัปเดตสิทธิ์ร้านได้";
      setBanner({ type: "error", message });
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleDeleteMembership = async (member: SystemUserMembership) => {
    const confirmed = window.confirm(
      member.role === "owner"
        ? "ไม่ควรลบ Owner คนสุดท้ายของร้านนี้ ยืนยันการลบหรือไม่?"
        : "ยืนยันการลบสิทธิ์ร้านนี้หรือไม่?",
    );
    if (!confirmed) {
      return;
    }
    setDeletingMemberId(member.id);
    setBanner(null);
    try {
      await systemConsoleApi.deleteStoreMember(member.id);
      setBanner({ type: "success", message: "ลบสิทธิ์ร้านสำเร็จ" });
      await reloadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถลบสิทธิ์ร้านได้";
      setBanner({ type: "error", message });
    } finally {
      setDeletingMemberId(null);
    }
  };

  const handleCreateMembership = async (user: SystemUserRow) => {
    const draft = membershipDrafts[user.id] ?? { storeId: "", role: DEFAULT_ROLE };
    if (!draft.storeId) {
      setBanner({ type: "error", message: "กรุณาเลือกร้านก่อนเพิ่มสิทธิ์" });
      return;
    }
    setCreatingForUserId(user.id);
    setBanner(null);
    try {
      await systemConsoleApi.createStoreMember(user.id, draft.storeId, draft.role);
      setBanner({ type: "success", message: "เพิ่มสิทธิ์ร้านสำเร็จ" });
      setMembershipDrafts((prev) => ({ ...prev, [user.id]: { storeId: "", role: DEFAULT_ROLE } }));
      await reloadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถเพิ่มสิทธิ์ร้านได้";
      setBanner({ type: "error", message });
    } finally {
      setCreatingForUserId(null);
    }
  };

  const renderMembership = (member: SystemUserMembership) => {
    const draftRole = membershipRoleDrafts[member.id] ?? ((member.role as SystemRoleId | null) ?? DEFAULT_ROLE);
    const isSaving = savingMemberId === member.id;
    const isDeleting = deletingMemberId === member.id;
    const storeLabel = member.store_name ?? "ร้านที่ไม่ระบุชื่อ";

    return (
      <div key={member.id} className="rounded-lg border p-3">
        <div className="flex flex-col gap-1 text-sm">
          <div className="font-medium text-foreground">{storeLabel}</div>
          <div className="text-xs text-muted-foreground">บทบาทปัจจุบัน: {member.role ?? "ไม่ระบุ"}</div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <FormSelect
            value={draftRole}
            disabled={isSaving || isDeleting}
            onValueChange={(value) =>
              setMembershipRoleDrafts((prev) => ({ ...prev, [member.id]: value as SystemRoleId }))
            }
            options={ROLE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
          />
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground disabled:opacity-50"
              disabled={isSaving || draftRole === member.role}
              onClick={() => handleMembershipRoleChange(member, draftRole)}
            >
              อัปเดต
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1 font-medium text-destructive disabled:opacity-50"
              disabled={isDeleting}
              onClick={() => handleDeleteMembership(member)}
            >
              ลบ
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAddMembershipForm = (user: SystemUserRow) => {
    const draft = membershipDrafts[user.id] ?? { storeId: "", role: DEFAULT_ROLE };
    const usedStoreIds = new Set((user.memberships ?? []).map((m) => m.store_id).filter(Boolean) as string[]);
    const availableStores = stores.filter((store) => !usedStoreIds.has(store.id));

    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-sm font-medium">เพิ่มสิทธิ์ร้าน</p>
        {storeError ? <p className="text-xs text-destructive">{storeError}</p> : null}
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-xs font-medium text-muted-foreground md:col-span-2">
            ร้าน
            <FormSelect
              value={draft.storeId}
              disabled={!availableStores.length || creatingForUserId === user.id}
              onValueChange={(value) =>
                setMembershipDrafts((prev) => ({
                  ...prev,
                  [user.id]: { ...draft, storeId: value },
                }))
              }
              placeholder="เลือกสาขา"
              options={availableStores.map((store) => ({ value: store.id, label: store.name ?? "ร้านไม่ระบุชื่อ" }))}
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            สิทธิ์
            <FormSelect
              value={draft.role}
              disabled={creatingForUserId === user.id}
              onValueChange={(value) =>
                setMembershipDrafts((prev) => ({
                  ...prev,
                  [user.id]: { ...draft, role: value as SystemRoleId },
                }))
              }
              options={ROLE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-md border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"
          disabled={creatingForUserId === user.id || !draft.storeId}
          onClick={() => handleCreateMembership(user)}
        >
          เพิ่มสิทธิ์ร้าน
        </button>
      </div>
    );
  };

  return (
    <SystemLayout title="จัดการผู้ใช้" subtitle="ปรับสิทธิ์ระบบและสิทธิ์ร้านได้เฉพาะ Owner">
      {banner ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            banner.type === "success" ? "border-emerald-400 text-emerald-800" : "border-destructive text-destructive"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      {loading ? <LoadingState label="กำลังโหลดรายการผู้ใช้..." /> : null}

      {!loading && state === "ok" ? (
        <section className="stat-card space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h2 className="section-title mb-0">ผู้ใช้ทั้งหมด</h2>
              <p className="text-xs text-muted-foreground">Owner เท่านั้นที่แก้ไขสิทธิ์ได้</p>
            </div>
            {refreshing ? <p className="text-xs text-muted-foreground">กำลังรีเฟรชข้อมูล...</p> : null}
          </div>

          <div className="space-y-4">
            {rows.map((user) => {
              const draftRole = profileRoleDrafts[user.id] ?? ((user.role as SystemRoleId | null) ?? DEFAULT_ROLE);
              const disableProfileSave = savingProfileId === user.id || draftRole === user.role;

              return (
                <article key={user.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{user.email ?? "ไม่พบอีเมล"}</p>
                      <p className="text-xs text-muted-foreground">{user.full_name ?? "ไม่ระบุชื่อ"}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {user.created_at ? new Date(user.created_at).toLocaleString() : "-"}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">System Role</p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <FormSelect
                          value={draftRole}
                          disabled={savingProfileId === user.id}
                          onValueChange={(value) =>
                            setProfileRoleDrafts((prev) => ({
                              ...prev,
                              [user.id]: value as SystemRoleId,
                            }))
                          }
                          options={ROLE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                        />
                        <button
                          type="button"
                          className="rounded-md bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                          disabled={disableProfileSave}
                          onClick={() => handleSaveProfileRole(user, draftRole)}
                        >
                          บันทึก
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">สถานะปัจจุบัน</p>
                      <div className="mt-2">
                        <StatusBadge label={user.role ?? "ไม่ระบุ"} tone={user.role === "owner" ? "success" : "info"} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Store Memberships</p>
                      <p className="text-xs text-muted-foreground">
                        เชื่อมต่อ {user.memberships?.length ?? 0} ร้าน
                      </p>
                    </div>
                    {user.memberships?.length ? (
                      <div className="space-y-3">
                        {user.memberships.map((member) => renderMembership(member))}
                      </div>
                    ) : (
                      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                        ยังไม่ได้เชื่อมต่อร้าน
                      </p>
                    )}

                    {renderAddMembershipForm(user)}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {!loading && state !== "ok" ? (
        <EmptyState
          title={state === "error" ? "โหลดข้อมูลผู้ใช้ไม่สำเร็จ" : "ยังไม่พบข้อมูลผู้ใช้"}
          description={
            state === "error"
              ? "ตรวจสอบ token Owner และ backend system console"
              : "สร้างผู้ใช้และลองใหม่อีกครั้ง"
          }
        />
      ) : null}
    </SystemLayout>
  );
}
