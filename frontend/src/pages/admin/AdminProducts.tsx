import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataTable from "@/components/shared/DataTable";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import FormField from "@/components/shared/FormField";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  storeAdminApi,
  type ApiProduct,
  type ApiCategory,
  type ApiProductAddon,
  type ApiProductAddonRecipe,
  type ApiIngredient,
  type ProductPayload,
  type ProductOptionsPayload,
  type ProductAddonPayload,
  type ProductAddonUpdatePayload,
  type ProductAddonRecipePayload,
  type ProductAddonRecipeUpdatePayload,
} from "@/services/storeAdminApi";
import { useProfileRole } from "@/contexts/RoleContext";
import { formatTHB } from "@/lib/format";

const SWEETNESS_LEVELS = [0, 25, 50, 75, 100] as const;

type FormState = {
  id?: string;
  name: string;
  basePrice: string;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  isSpecial: boolean;
  imageUrl: string;
  description: string;
};

type SweetnessState = {
  loading: boolean;
  saving: boolean;
  error: string;
  allowSweetness: boolean;
  defaultSweetness: number;
  dirty: boolean;
};

type AddonFormState = {
  id?: string;
  name: string;
  code: string;
  price: string;
  maxQuantity: string;
  isActive: boolean;
};

type RecipeFormState = {
  addonId: string;
  recipeId?: string;
  ingredientId: string;
  quantity: string;
  unit: string;
  mode: "create" | "edit";
};

const emptyForm: FormState = {
  name: "",
  basePrice: "0",
  categoryId: "",
  categoryName: "",
  isActive: true,
  isSpecial: false,
  imageUrl: "",
  description: "",
};

const emptySweetnessState: SweetnessState = {
  loading: false,
  saving: false,
  error: "",
  allowSweetness: false,
  defaultSweetness: 100,
  dirty: false,
};

const emptyAddonForm: AddonFormState = {
  name: "เพิ่มช็อต",
  code: "extra_shot",
  price: "15",
  maxQuantity: "1",
  isActive: true,
};

export default function AdminProductsPage() {
  const { role, loading: roleLoading } = useProfileRole();
  const [rows, setRows] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sweetness, setSweetness] = useState<SweetnessState>(emptySweetnessState);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [addons, setAddons] = useState<ApiProductAddon[]>([]);
  const [addonForm, setAddonForm] = useState<AddonFormState>(emptyAddonForm);
  const [activeAddonId, setActiveAddonId] = useState<string | null>(null);
  const [addonError, setAddonError] = useState("");
  const [addonSaving, setAddonSaving] = useState(false);
  const [recipeForm, setRecipeForm] = useState<RecipeFormState | null>(null);
  const [recipeError, setRecipeError] = useState("");
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [ingredients, setIngredients] = useState<ApiIngredient[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [ingredientsError, setIngredientsError] = useState("");

  const valid = useMemo(() => form.name.trim().length > 1 && Number(form.basePrice) >= 0, [form]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const res = await storeAdminApi.listMenus();
      setRows(res.items ?? []);
      setCategories(res.categories ?? []);
    } catch (err: any) {
      setError(err?.message || "โหลดเมนูไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetFileState() {
    setSelectedFile(null);
    setImagePreview(null);
  }

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    } else {
      setImagePreview(null);
    }
  }

  async function uploadImage(productId: string) {
    if (!selectedFile) return;
    try {
      setUploading(true);
      const updated = await storeAdminApi.uploadProductImage(productId, selectedFile);
      setForm((prev) => ({ ...prev, imageUrl: updated.image_url || "" }));
      setInfo("อัปโหลดรูปสำเร็จ");
    } catch (err: any) {
      setError(err?.message || "อัปโหลดรูปไม่สำเร็จ");
      throw err;
    } finally {
      setUploading(false);
      resetFileState();
    }
  }

  async function submit() {
    if (!valid) {
      setError("กรุณากรอกชื่อเมนูและราคาขายให้ถูกต้อง");
      return;
    }

    const payload: ProductPayload = {
      name: form.name.trim(),
      base_price: Number(form.basePrice),
      category_id: form.categoryId || null,
      category_name: form.categoryId ? undefined : form.categoryName.trim() || undefined,
      is_active: form.isActive,
      is_special: form.isSpecial,
      image_url: form.imageUrl || undefined,
      description: form.description || undefined,
    };

    try {
      let productId = form.id;
      if (productId) {
        await storeAdminApi.updateMenu(productId, payload);
        setInfo("อัปเดตเมนูเรียบร้อย");
      } else {
        const created = await storeAdminApi.createMenu(payload);
        productId = created.id;
        setInfo("เพิ่มเมนูเรียบร้อย");
      }

      if (productId && selectedFile) {
        await uploadImage(productId);
      }

      setForm(emptyForm);
      resetFileState();
      void refresh();
    } catch (err: any) {
      const reason = err?.message || "บันทึกไม่สำเร็จ";
      if (reason === "product_name_exists") setError("มีชื่อเมนูนี้แล้ว");
      else if (reason === "unauthorized" || reason === "missing_token") setError("ต้องเข้าสู่ระบบก่อนใช้งาน");
      else setError(reason);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("การลบเมนูนี้จะลบข้อมูลถาวรและประวัติที่เกี่ยวข้อง คุณแน่ใจหรือไม่?");
    if (!confirmed) return;
    setError("");
    try {
      const res = await storeAdminApi.deleteMenu(id);
      if (res.status === "deactivated") setInfo("ปิดการใช้งานเมนูที่มีประวัติแล้ว");
      else setInfo("ลบเมนูแล้ว");
    } catch (err: any) {
      const msg = err?.message || "ลบไม่สำเร็จ";
      if (msg === "product_has_history") setInfo("ไม่สามารถลบได้ มีประวัติการใช้งาน");
      else setError(msg);
    }
    void refresh();
  }

  async function handleToggleActive(id: string, nextActive: boolean) {
    setError("");
    try {
      await storeAdminApi.updateMenu(id, { is_active: nextActive });
      setInfo(nextActive ? "เปิดใช้งานเมนูแล้ว" : "ปิดใช้งานเมนูแล้ว");
    } catch (err: any) {
      setError(err?.message || "อัปเดตสถานะเมนูไม่สำเร็จ");
    }
    void refresh();
  }

  function resetOptionState() {
    setSweetness(emptySweetnessState);
    setAddons([]);
    setAddonForm(emptyAddonForm);
    setActiveAddonId(null);
    setAddonError("");
    setRecipeForm(null);
    setRecipeError("");
  }

  const loadProductOptions = async (productId: string) => {
    setOptionsLoading(true);
    setSweetness((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await storeAdminApi.getProductOptions(productId);
      setSweetness({
        loading: false,
        saving: false,
        error: "",
        allowSweetness: data.allow_sweetness,
        defaultSweetness: data.default_sweetness,
        dirty: false,
      });
      setAddons(data.addons ?? []);
      setAddonForm(emptyAddonForm);
      setActiveAddonId(null);
      setAddonError("");
      setRecipeForm(null);
      setRecipeError("");
    } catch (err: any) {
      setSweetness((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "โหลดตัวเลือกไม่สำเร็จ",
      }));
    } finally {
      setOptionsLoading(false);
    }
  };

  const ensureIngredients = async () => {
    if (ingredients.length > 0 || ingredientsLoading) return;
    setIngredientsLoading(true);
    setIngredientsError("");
    try {
      const res = await storeAdminApi.listIngredients();
      setIngredients(res.items ?? []);
    } catch (err: any) {
      setIngredientsError(err?.message || "โหลดวัตถุดิบไม่สำเร็จ");
    } finally {
      setIngredientsLoading(false);
    }
  };

  useEffect(() => {
    if (!form.id) {
      resetOptionState();
      return;
    }
    void loadProductOptions(form.id);
  }, [form.id]);

  const handleSweetnessToggle = (checked: boolean) => {
    setSweetness((prev) => ({ ...prev, allowSweetness: checked, dirty: true }));
  };

  const handleSweetnessDefaultChange = (value: number) => {
    setSweetness((prev) => ({ ...prev, defaultSweetness: value, dirty: true }));
  };

  const handleSweetnessSave = async () => {
    if (!form.id || sweetness.saving) return;
    const payload: ProductOptionsPayload = {
      allow_sweetness: sweetness.allowSweetness,
    };
    if (sweetness.allowSweetness) {
      payload.default_sweetness = sweetness.defaultSweetness;
    }
    setSweetness((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      await storeAdminApi.updateProductOptions(form.id, payload);
      setSweetness((prev) => ({ ...prev, saving: false, dirty: false }));
      setInfo("บันทึกตั้งค่าความหวานแล้ว");
    } catch (err: any) {
      setSweetness((prev) => ({ ...prev, saving: false, error: err?.message || "บันทึกไม่สำเร็จ" }));
    }
  };

  const startCreateAddon = () => {
    setAddonForm(emptyAddonForm);
    setActiveAddonId("new");
    setAddonError("");
    setRecipeForm(null);
  };

  const startEditAddon = (addon: ApiProductAddon) => {
    setAddonForm({
      id: addon.id,
      name: addon.name,
      code: addon.code || "",
      price: String(addon.price ?? 0),
      maxQuantity: addon.max_quantity != null ? String(addon.max_quantity) : "",
      isActive: addon.is_active ?? true,
    });
    setActiveAddonId(addon.id);
    setAddonError("");
    setRecipeForm(null);
  };

  const cancelAddonForm = () => {
    setAddonForm(emptyAddonForm);
    setActiveAddonId(null);
    setAddonError("");
  };

  const handleAddonSubmit = async () => {
    if (!form.id || addonSaving) return;
    const priceNum = Number(addonForm.price || 0);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setAddonError("กรุณากำหนดราคาที่ถูกต้อง");
      return;
    }
    const trimmedMax = addonForm.maxQuantity.trim();
    const maxQuantityNum = trimmedMax ? Number(trimmedMax) : null;
    if (trimmedMax && (Number.isNaN(maxQuantityNum) || maxQuantityNum < 0)) {
      setAddonError("จำนวนสูงสุดต้องไม่ติดลบ");
      return;
    }
    const basePayload: ProductAddonPayload = {
      name: addonForm.name.trim() || "เพิ่มช็อต",
      code: addonForm.code.trim() || undefined,
      addon_type: "extra_shot",
      price: priceNum,
      max_quantity: maxQuantityNum,
      is_active: addonForm.isActive,
    };
    setAddonSaving(true);
    setAddonError("");
    try {
      if (addonForm.id) {
        const updatePayload: ProductAddonUpdatePayload = { ...basePayload };
        await storeAdminApi.updateProductAddon(addonForm.id, updatePayload);
        setInfo("อัปเดตตัวเลือกเสริมแล้ว");
      } else {
        await storeAdminApi.createProductAddon(form.id, basePayload);
        setInfo("เพิ่มตัวเลือกเสริมแล้ว");
      }
      cancelAddonForm();
      await loadProductOptions(form.id);
    } catch (err: any) {
      setAddonError(err?.message || "บันทึกตัวเลือกเสริมไม่สำเร็จ");
    } finally {
      setAddonSaving(false);
    }
  };

  const handleAddonDeactivate = async (addonId: string) => {
    if (!form.id) return;
    setAddonError("");
    try {
      await storeAdminApi.deactivateProductAddon(addonId);
      setInfo("ปิดใช้งานตัวเลือกเสริมแล้ว");
      if (activeAddonId === addonId) {
        cancelAddonForm();
      }
      await loadProductOptions(form.id);
    } catch (err: any) {
      setAddonError(err?.message || "ปิดการใช้งานไม่สำเร็จ");
    }
  };

  const openRecipeForm = async (addon: ApiProductAddon, recipe?: ApiProductAddonRecipe) => {
    await ensureIngredients();
    setRecipeError("");
    setRecipeForm({
      addonId: addon.id,
      recipeId: recipe?.id,
      ingredientId: recipe?.ingredient_id || "",
      quantity: recipe ? String(recipe.quantity_used ?? 0) : "0",
      unit: recipe?.unit || "",
      mode: recipe ? "edit" : "create",
    });
  };

  const cancelRecipeForm = () => {
    setRecipeForm(null);
    setRecipeError("");
  };

  const handleRecipeSubmit = async () => {
    if (!recipeForm || !form.id) return;
    if (!recipeForm.ingredientId) {
      setRecipeError("กรุณาเลือกวัตถุดิบ");
      return;
    }
    const qty = Number(recipeForm.quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      setRecipeError("ปริมาณต้องมากกว่า 0");
      return;
    }
    const payload: ProductAddonRecipePayload | ProductAddonRecipeUpdatePayload = {
      ingredient_id: recipeForm.ingredientId,
      quantity_used: qty,
      unit: recipeForm.unit.trim() || undefined,
    };
    setRecipeSaving(true);
    setRecipeError("");
    try {
      if (recipeForm.mode === "edit" && recipeForm.recipeId) {
        await storeAdminApi.updateAddonRecipe(recipeForm.recipeId, payload);
        setInfo("อัปเดตสูตรตัวเลือกเสริมแล้ว");
      } else {
        await storeAdminApi.createAddonRecipe(recipeForm.addonId, payload as ProductAddonRecipePayload);
        setInfo("เพิ่มสูตรตัวเลือกเสริมแล้ว");
      }
      cancelRecipeForm();
      await loadProductOptions(form.id);
    } catch (err: any) {
      setRecipeError(err?.message || "บันทึกสูตรไม่สำเร็จ");
    } finally {
      setRecipeSaving(false);
    }
  };

  const handleRecipeDelete = async (recipeId: string) => {
    if (!form.id) return;
    setRecipeError("");
    try {
      await storeAdminApi.deleteAddonRecipe(recipeId);
      setInfo("ลบสูตรแล้ว");
      if (recipeForm?.recipeId === recipeId) {
        cancelRecipeForm();
      }
      await loadProductOptions(form.id);
    } catch (err: any) {
      setRecipeError(err?.message || "ลบสูตรไม่สำเร็จ");
    }
  };

  const renderSweetnessCard = () => (
    <div className="stat-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title text-base">ตั้งค่าความหวาน</h3>
          <p className="text-sm text-muted-foreground">กำหนดว่าลูกค้าสามารถเลือกความหวานได้หรือไม่ และตั้งค่าความหวานเริ่มต้น</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="form-checkbox"
            checked={sweetness.allowSweetness}
            onChange={(event) => handleSweetnessToggle(event.target.checked)}
          />
          <span>ให้ลูกค้าเลือกระดับความหวาน</span>
        </label>
      </div>
      {sweetness.error ? <p className="text-sm text-destructive">{sweetness.error}</p> : null}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {SWEETNESS_LEVELS.map((level) => {
          const isSelected = sweetness.defaultSweetness === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => handleSweetnessDefaultChange(level)}
              disabled={!sweetness.allowSweetness}
              className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                isSelected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
              } ${!sweetness.allowSweetness ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {level}%
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded px-4 py-2 bg-primary text-primary-foreground text-sm disabled:opacity-50"
          onClick={handleSweetnessSave}
          disabled={!sweetness.dirty || sweetness.saving}
        >
          {sweetness.saving ? "กำลังบันทึก..." : "บันทึกความหวาน"}
        </button>
        {sweetness.dirty ? <span className="text-xs text-muted-foreground">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span> : null}
        {optionsLoading ? <span className="text-xs text-muted-foreground">กำลังโหลดข้อมูล...</span> : null}
      </div>
    </div>
  );

  const renderAddonFormBlock = () => {
    if (!activeAddonId) return null;
    return (
      <div className="rounded-2xl border border-dashed p-4 space-y-3 bg-muted/20">
        <div>
          <h4 className="font-semibold text-sm">{addonForm.id ? "แก้ไขตัวเลือกเสริม" : "เพิ่มตัวเลือกเสริม"}</h4>
          <p className="text-xs text-muted-foreground">รองรับเฉพาะ Extra Shot ในเฟสนี้</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="ชื่อที่แสดง">
            <input className="form-input" value={addonForm.name} onChange={(e) => setAddonForm((prev) => ({ ...prev, name: e.target.value }))} />
          </FormField>
          <FormField label="รหัส (เช่น extra_shot)">
            <input className="form-input" value={addonForm.code} onChange={(e) => setAddonForm((prev) => ({ ...prev, code: e.target.value }))} />
          </FormField>
          <FormField label="ราคาต่อช็อต (บาท)">
            <input
              type="number"
              min={0}
              className="form-input"
              value={addonForm.price}
              onChange={(e) => setAddonForm((prev) => ({ ...prev, price: e.target.value }))}
            />
          </FormField>
          <FormField label="จำนวนสูงสุด (ช็อต)">
            <input
              type="number"
              min={0}
              className="form-input"
              value={addonForm.maxQuantity}
              onChange={(e) => setAddonForm((prev) => ({ ...prev, maxQuantity: e.target.value }))}
              placeholder="เช่น 2"
            />
          </FormField>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="form-checkbox"
            checked={addonForm.isActive}
            onChange={(e) => setAddonForm((prev) => ({ ...prev, isActive: e.target.checked }))}
          />
          <span>เปิดใช้งานตัวเลือกนี้</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded px-4 py-2 bg-primary text-primary-foreground text-sm disabled:opacity-50"
            onClick={handleAddonSubmit}
            disabled={addonSaving}
          >
            {addonSaving ? "กำลังบันทึก..." : addonForm.id ? "บันทึกตัวเลือก" : "เพิ่มตัวเลือก"}
          </button>
          <button type="button" className="rounded px-4 py-2 border text-sm" onClick={cancelAddonForm}>
            ยกเลิก
          </button>
        </div>
      </div>
    );
  };

  const renderRecipeFormBlock = () => {
    if (!recipeForm) return null;
    const targetAddon = addons.find((addon) => addon.id === recipeForm.addonId);
    return (
      <div className="rounded-2xl border border-dashed p-4 space-y-3 bg-muted/10">
        <div>
          <h4 className="font-semibold text-sm">
            {recipeForm.mode === "edit" ? "แก้ไขสูตรต้นทุน" : "เพิ่มสูตรต้นทุน"} · {targetAddon?.name ?? "ตัวเลือกเสริม"}
          </h4>
          <p className="text-xs text-muted-foreground">สูตรนี้ใช้คำนวณต้นทุน Extra Shot</p>
        </div>
        {ingredientsError ? <p className="text-sm text-destructive">{ingredientsError}</p> : null}
        {ingredientsLoading ? <p className="text-xs text-muted-foreground">กำลังโหลดรายการวัตถุดิบ...</p> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <FormField label="วัตถุดิบ">
            <select
              className="form-input"
              value={recipeForm.ingredientId}
              onChange={(e) => setRecipeForm((prev) => (prev ? { ...prev, ingredientId: e.target.value } : prev))}
            >
              <option value="">เลือกวัตถุดิบ</option>
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ปริมาณที่ใช้">
            <input
              type="number"
              min={0}
              step="0.01"
              className="form-input"
              value={recipeForm.quantity}
              onChange={(e) => setRecipeForm((prev) => (prev ? { ...prev, quantity: e.target.value } : prev))}
            />
          </FormField>
          <FormField label="หน่วย (เช่น g, ml)">
            <input className="form-input" value={recipeForm.unit} onChange={(e) => setRecipeForm((prev) => (prev ? { ...prev, unit: e.target.value } : prev))} />
          </FormField>
        </div>
        {recipeError ? <p className="text-sm text-destructive">{recipeError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded px-4 py-2 bg-primary text-primary-foreground text-sm disabled:opacity-50"
            onClick={handleRecipeSubmit}
            disabled={recipeSaving}
          >
            {recipeSaving ? "กำลังบันทึก..." : "บันทึกสูตร"}
          </button>
          <button type="button" className="rounded px-4 py-2 border text-sm" onClick={cancelRecipeForm}>
            ยกเลิก
          </button>
        </div>
      </div>
    );
  };

  const renderAddonCard = () => (
    <div className="stat-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title text-base">ตัวเลือกเสริม</h3>
          <p className="text-sm text-muted-foreground">รองรับ Extra Shot ต่อแก้ว พร้อมระบุราคาขายและสูตรต้นทุน</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border px-3 py-1 text-sm"
          onClick={startCreateAddon}
          disabled={!form.id}
        >
          <Plus className="w-4 h-4" /> เพิ่มตัวเลือกเสริม
        </button>
      </div>
      {addonError ? <p className="text-sm text-destructive">{addonError}</p> : null}
      {optionsLoading ? <span className="text-xs text-muted-foreground">กำลังโหลดข้อมูลตัวเลือก...</span> : null}
      {addons.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีตัวเลือกเสริมสำหรับเมนูนี้</p>
      ) : (
        <div className="space-y-3">
          {addons.map((addon) => (
            <div key={addon.id} className="rounded-2xl border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{addon.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ราคา {formatTHB(addon.price ?? 0)} · สูงสุด {addon.max_quantity ?? 1} ช็อต · รหัส {addon.code || "-"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ต้นทุนต่อช็อต: {addon.unit_cost != null ? formatTHB(addon.unit_cost) : "ยังไม่ตั้ง"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button type="button" className="rounded border px-2 py-1" onClick={() => startEditAddon(addon)}>
                    แก้ไข
                  </button>
                  <button type="button" className="rounded border px-2 py-1" onClick={() => openRecipeForm(addon)}>
                    สูตรต้นทุน
                  </button>
                  {addon.is_active ?? true ? (
                    <button
                      type="button"
                      className="rounded border border-destructive px-2 py-1 text-destructive"
                      onClick={() => handleAddonDeactivate(addon.id)}
                    >
                      ปิดใช้งาน
                    </button>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">ปิดใช้งาน</span>
                  )}
                </div>
              </div>
              {addon.recipes && addon.recipes.length > 0 ? (
                <div className="space-y-2 rounded-xl bg-muted/40 p-3">
                  {addon.recipes.map((recipe) => (
                    <div key={recipe.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-medium">{recipe.ingredient_name || "วัตถุดิบ"}</p>
                        <p className="text-muted-foreground">
                          {recipe.quantity_used} {recipe.unit || recipe.ingredient_unit || ""} · ต้นทุน {formatTHB(recipe.line_cost ?? 0)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className="underline" onClick={() => openRecipeForm(addon, recipe)}>
                          แก้ไข
                        </button>
                        <button type="button" className="text-destructive underline" onClick={() => handleRecipeDelete(recipe.id)}>
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">ยังไม่มีสูตรต้นทุน</p>
              )}
            </div>
          ))}
        </div>
      )}
      {renderAddonFormBlock()}
      {renderRecipeFormBlock()}
    </div>
  );

  const categoryOptions = [{ id: "", name: "-- ไม่ระบุหมวดหมู่ --" }, ...categories];

  return (
    <AdminLayout title="เมนูสินค้า" subtitle="จัดการเมนู หมวดหมู่ และสถานะการเปิดใช้งาน">
      <div className="stat-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title text-base">{form.id ? "แก้ไขเมนู" : "เพิ่มเมนูใหม่"}</h2>
          {refreshing ? <div className="flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลด</div> : null}
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <FormField label="ชื่อเมนู">
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="หมวดหมู่ (เลือก)">
            <select
              className="form-input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value, categoryName: "" })}
            >
              {categoryOptions.map((c) => (
                <option key={c.id || "none"} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="หรือสร้างหมวดใหม่">
            <input
              className="form-input"
              placeholder="ใส่ชื่อหมวดหมู่ใหม่"
              value={form.categoryName}
              onChange={(e) => setForm({ ...form, categoryName: e.target.value, categoryId: "" })}
            />
          </FormField>
          <FormField label="ราคาขายพื้นฐาน (฿)">
            <input
              type="number"
              className="form-input"
              min={0}
              value={form.basePrice}
              onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
            />
          </FormField>
          <FormField label="สถานะ">
            <select
              className="form-input"
              value={form.isActive ? "active" : "inactive"}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === "active" })}
            >
              <option value="active">เปิดใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
          </FormField>
          <FormField label="เมนูแนะนำ">
            <select
              className="form-input"
              value={form.isSpecial ? "yes" : "no"}
              onChange={(e) => setForm({ ...form, isSpecial: e.target.value === "yes" })}
            >
              <option value="no">ไม่ระบุ</option>
              <option value="yes">แนะนำ</option>
            </select>
          </FormField>
          <FormField label="อัปโหลดรูปเมนู">
            <div className="space-y-2">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="form-input"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                disabled={roleLoading || role === "staff"}
              />
              {imagePreview ? (
                <img src={imagePreview} alt="ตัวอย่างรูปเมนู" className="h-24 w-24 rounded object-cover border" />
              ) : form.imageUrl ? (
                <img src={form.imageUrl} alt="ตัวอย่างรูปเมนู" className="h-24 w-24 rounded object-cover border" />
              ) : (
                <div className="h-24 w-24 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">ไม่มีรูป</div>
              )}
              {selectedFile && form.id ? (
                <button
                  type="button"
                  className="px-3 py-1 text-sm rounded bg-primary text-primary-foreground disabled:opacity-60"
                  onClick={() => uploadImage(form.id!)}
                  disabled={uploading}
                >
                  {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปใหม่"}
                </button>
              ) : null}
            </div>
          </FormField>
          <FormField label="URL รูปภาพเมนู">
            <input
              className="form-input"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="ใช้ URL ชั่วคราวก่อน Supabase Storage"
            />
          </FormField>
          <FormField label="คำอธิบาย">
            <textarea
              className="form-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </FormField>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
        <div className="flex gap-2">
          <button type="button" className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={submit}>
            {form.id ? "บันทึกการแก้ไข" : "เพิ่มเมนู"}
          </button>
          {form.id ? (
            <button type="button" className="px-4 py-2 rounded border" onClick={() => setForm(emptyForm)}>
              ยกเลิก
            </button>
          ) : null}
        </div>
      </div>

      {!form.id ? (
        <div className="stat-card text-sm text-muted-foreground">บันทึกเมนูก่อนตั้งค่าตัวเลือกสำหรับลูกค้า เช่น ความหวานหรือเพิ่มช็อต</div>
      ) : (
        <>
          {renderSweetnessCard()}
          {renderAddonCard()}
        </>
      )}

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีเมนู" description="เพิ่มเมนูแรกเพื่อเริ่มต้น" />
      ) : (
        <DataTable
          columns={[
            {
              key: "name",
              header: "เมนู",
              render: (r) => (
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setForm({
                      id: r.id,
                      name: r.name,
                      basePrice: String(r.base_price),
                      categoryId: r.category_id || "",
                      categoryName: r.category_name || "",
                      isActive: r.is_active ?? true,
                      isSpecial: r.is_special ?? false,
                      imageUrl: r.image_url || "",
                      description: r.description || "",
                    })
                  }
                >
                  {r.name}
                </button>
              ),
            },
            { key: "category_name", header: "หมวดหมู่", render: (r) => r.category_name || "-" },
            { key: "base_price", header: "ราคา", render: (r) => `฿${Number(r.base_price).toFixed(2)}` },
            {
              key: "is_active",
              header: "สถานะ",
              render: (r) => <StatusBadge label={(r.is_active ?? true) ? "active" : "inactive"} tone={(r.is_active ?? true) ? "success" : "warning"} />,
            },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-muted"
                    onClick={() => handleToggleActive(r.id, !(r.is_active ?? true))}
                  >
                    {(r.is_active ?? true) ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-destructive px-2 py-1 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(r.id)}
                  >
                    ลบถาวร
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      )}
    </AdminLayout>
  );
}
