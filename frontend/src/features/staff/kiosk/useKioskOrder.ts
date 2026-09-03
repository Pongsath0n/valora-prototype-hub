import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "@/components/ui/use-toast";
import { customerApi, type CustomerMenuItem } from "@/services/customerApi";
import {
  storeAdminApi,
  type ApiOrder,
  type KioskOrderPayload,
  type StorePaymentSettings,
} from "@/services/storeAdminApi";

import { buildItemOptions, getCartTotal, sanitizeSweetness } from "./cart";
import { ALL_CATEGORY } from "./kioskConfig";
import type { CartAddonSelection, CartItem, DraftItem, PaymentMethod, Step } from "./types";

function createDefaultDraft(product: CustomerMenuItem): DraftItem {
  return {
    quantity: 1,
    sweetness: product.allow_sweetness ? sanitizeSweetness(product.default_sweetness) : undefined,
    note: "",
    addons: {},
  };
}

function createDraftFromCartItem(item: CartItem, product: CustomerMenuItem): DraftItem {
  return {
    quantity: item.quantity,
    sweetness: product.allow_sweetness ? item.sweetness : undefined,
    note: item.note ?? "",
    addons: item.addons.reduce<Record<string, number>>((acc, addon) => {
      acc[addon.addon_id] = addon.quantity;
      return acc;
    }, {}),
  };
}

/**
 * Single source of truth for the Staff Kiosk flow.
 *
 * Owns menu loading, cart state, the item-options dialog, step navigation and
 * order submission. The page and presentational components stay dumb and just
 * consume this hook, which keeps business logic in one testable place.
 */
export function useKioskOrder() {
  // --- Menu -----------------------------------------------------------------
  const [menus, setMenus] = useState<CustomerMenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(ALL_CATEGORY);
  const [search, setSearch] = useState("");

  // --- Cart & order meta ----------------------------------------------------
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNote, setOrderNote] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // --- Flow -----------------------------------------------------------------
  const [activeStep, setActiveStep] = useState<Step>("menu");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("promptpay");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState<ApiOrder | null>(null);

  // --- FIX-B: Transaction idempotency --------------------------------------
  // client_order_id is generated ONCE per logical checkout attempt and
  // survives accidental duplicate submissions and retries.  It is reset
  // only after a successful sale or when the user starts a new transaction.
  const [clientOrderId, setClientOrderId] = useState<string | null>(null);

  // --- FIX-D: Partial-commit safety state ----------------------------------
  // When the backend returns kiosk_order_stock_sync_failed, the order +
  // payment are persisted but stock sync failed.  The UI must NOT allow
  // a resubmit — that would create a duplicate charge.
  const [stockSyncFailure, setStockSyncFailure] = useState<{
    order_id: string;
    order_no?: string;
  } | null>(null);

  // --- Payment settings ------------------------------------------------------
  const [paymentSettings, setPaymentSettings] = useState<StorePaymentSettings | null>(null);
  const [paymentSettingsLoading, setPaymentSettingsLoading] = useState(true);
  const [paymentSettingsError, setPaymentSettingsError] = useState<string | null>(null);

  // --- Item options dialog --------------------------------------------------
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProduct, setDialogProduct] = useState<CustomerMenuItem | null>(null);
  const [dialogDraft, setDialogDraft] = useState<DraftItem | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const hasItems = cart.length > 0;

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError(null);
    try {
      const items = await customerApi.listMenu();
      setMenus(items);
    } catch (error: any) {
      setMenuError(error?.message || "ไม่สามารถโหลดเมนูได้");
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const loadPaymentSettings = useCallback(async () => {
    setPaymentSettingsLoading(true);
    setPaymentSettingsError(null);
    try {
      const response = await storeAdminApi.getPaymentSettings();
      setPaymentSettings(response.settings);
      return response.settings;
    } catch (error: any) {
      const message = error?.message || "ไม่สามารถโหลดการตั้งค่าชำระเงินได้";
      setPaymentSettingsError(message);
      setPaymentSettings(null);
      return null;
    } finally {
      setPaymentSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPaymentSettings();
  }, [loadPaymentSettings]);

  // If the cart empties out, never strand the user on the payment step.
  useEffect(() => {
    if (!hasItems && activeStep === "payment") {
      setActiveStep("menu");
    }
  }, [hasItems, activeStep]);

  // Reset dialog scratch state whenever it closes.
  useEffect(() => {
    if (!dialogOpen) {
      setDialogProduct(null);
      setDialogDraft(null);
      setEditingIndex(null);
    }
  }, [dialogOpen]);

  const categories = useMemo(() => {
    const bucket = new Set<string>();
    menus.forEach((item) => {
      if (item.category) bucket.add(item.category);
    });
    return Array.from(bucket);
  }, [menus]);

  const visibleMenus = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return menus.filter((item) => {
      if (category !== ALL_CATEGORY && item.category !== category) return false;
      if (!normalizedSearch) return true;
      const haystack = `${item.name} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [menus, category, search]);

  const orderTotal = useMemo(() => getCartTotal(cart), [cart]);

  const availablePaymentMethods = useMemo<Record<PaymentMethod, boolean>>(
    () => ({
      promptpay: Boolean(paymentSettings?.is_promptpay_enabled),
      cash: Boolean(paymentSettings?.is_cash_enabled),
    }),
    [paymentSettings],
  );

  const promptpayEnabled = availablePaymentMethods.promptpay;
  const cashEnabled = availablePaymentMethods.cash;
  const noPaymentMethods = !promptpayEnabled && !cashEnabled;

  useEffect(() => {
    if (paymentSettingsLoading) return;
    if (!promptpayEnabled && paymentMethod === "promptpay" && cashEnabled) {
      setPaymentMethod("cash");
      return;
    }
    if (!cashEnabled && paymentMethod === "cash" && promptpayEnabled) {
      setPaymentMethod("promptpay");
    }
  }, [paymentSettingsLoading, promptpayEnabled, cashEnabled, paymentMethod]);

  // --- Dialog actions -------------------------------------------------------
  const openItemDialog = useCallback(
    (product: CustomerMenuItem, index: number | null) => {
      setDialogProduct(product);
      setEditingIndex(index);
      setDialogDraft(
        index != null && cart[index]
          ? createDraftFromCartItem(cart[index], product)
          : createDefaultDraft(product),
      );
      setDialogOpen(true);
    },
    [cart],
  );

  /** Open the dialog for an existing cart line by index (resolves the product). */
  const editCartItem = useCallback(
    (index: number) => {
      const item = cart[index];
      if (!item) return;
      const product = menus.find((menuItem) => menuItem.id === item.productId);
      if (product) {
        openItemDialog(product, index);
      } else {
        toast({ title: "ไม่พบเมนู", description: "เมนูนี้ถูกปิดการขายแล้ว", variant: "destructive" });
      }
    },
    [cart, menus, openItemDialog],
  );

  const incrementDraftQuantity = useCallback(() => {
    setDialogDraft((prev) => (prev ? { ...prev, quantity: prev.quantity + 1 } : prev));
  }, []);

  const decrementDraftQuantity = useCallback(() => {
    setDialogDraft((prev) => (prev ? { ...prev, quantity: Math.max(1, prev.quantity - 1) } : prev));
  }, []);

  const setDraftSweetness = useCallback((level: number) => {
    setDialogDraft((prev) => (prev ? { ...prev, sweetness: level } : prev));
  }, []);

  const setDraftNote = useCallback((note: string) => {
    setDialogDraft((prev) => (prev ? { ...prev, note } : prev));
  }, []);

  const setDraftAddonQuantity = useCallback((addonId: string, quantity: number) => {
    setDialogDraft((prev) =>
      prev ? { ...prev, addons: { ...prev.addons, [addonId]: Math.max(0, quantity) } } : prev,
    );
  }, []);

  const persistDraft = useCallback(() => {
    if (!dialogProduct || !dialogDraft) return;

    const addons = dialogProduct.addons
      .map((addon): CartAddonSelection | null => {
        const quantity = dialogDraft.addons[addon.addon_id] ?? 0;
        if (quantity <= 0) return null;
        return {
          addon_id: addon.addon_id,
          name: addon.name,
          price: addon.price,
          quantity,
          code: addon.code ?? null,
          max_quantity: addon.max_quantity ?? null,
        };
      })
      .filter((item): item is CartAddonSelection => Boolean(item));

    const nextItem: CartItem = {
      productId: dialogProduct.id,
      name: dialogProduct.name,
      basePrice: dialogProduct.price,
      quantity: Math.max(1, dialogDraft.quantity),
      sweetness: dialogProduct.allow_sweetness ? dialogDraft.sweetness : undefined,
      note: dialogDraft.note?.trim() || undefined,
      addons,
    };

    setCart((prev) => {
      if (editingIndex != null && prev[editingIndex]) {
        const clone = [...prev];
        clone[editingIndex] = nextItem;
        return clone;
      }
      return [...prev, nextItem];
    });

    setDialogOpen(false);
    toast({
      title: editingIndex != null ? "อัปเดตรายการแล้ว" : "เพิ่มลงตะกร้าแล้ว",
      description: dialogProduct.name,
    });
  }, [dialogProduct, dialogDraft, editingIndex]);

  // --- Cart actions ---------------------------------------------------------
  const removeItem = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const adjustItemQuantity = useCallback((index: number, delta: number) => {
    setCart((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const clone = [...prev];
      clone[index] = { ...target, quantity: Math.max(1, target.quantity + delta) };
      return clone;
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // --- Step navigation ------------------------------------------------------
  const goToMenu = useCallback(() => setActiveStep("menu"), []);

  const goToPayment = useCallback(() => {
    if (cart.length === 0) return;
    setActiveStep("payment");
  }, [cart.length]);

  const resetFlow = useCallback(() => {
    setSuccessOrder(null);
    setActiveStep("menu");
    setSubmitError("");
    setClientOrderId(null);
    setStockSyncFailure(null);
  }, []);

  // --- Submission -----------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (cart.length === 0 || submitting) return;
    if (stockSyncFailure) return; // FIX-D: do not resubmit after partial commit
    if (paymentSettingsLoading) {
      setSubmitError("กำลังโหลดการตั้งค่าชำระเงิน โปรดรอสักครู่");
      return;
    }
    if (noPaymentMethods) {
      const message = "ร้านยังไม่ได้เปิดช่องทางรับชำระเงิน";
      setSubmitError(message);
      toast({ title: "ไม่สามารถบันทึกได้", description: message, variant: "destructive" });
      return;
    }
    if (!promptpayEnabled && paymentMethod === "promptpay") {
      const message = "PromptPay ถูกปิดใช้งานสำหรับร้านนี้";
      setSubmitError(message);
      toast({ title: "ไม่สามารถบันทึกได้", description: message, variant: "destructive" });
      return;
    }
    if (!cashEnabled && paymentMethod === "cash") {
      const message = "เงินสดถูกปิดใช้งานสำหรับร้านนี้";
      setSubmitError(message);
      toast({ title: "ไม่สามารถบันทึกได้", description: message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      // FIX-B: Generate client_order_id ONCE for this logical checkout.
      // Survives duplicate submissions and retries. Reset only on success
      // or new transaction (resetFlow).
      let orderId = clientOrderId;
      if (!orderId) {
        orderId = crypto.randomUUID();
        setClientOrderId(orderId);
      }

      const payload: KioskOrderPayload = {
        items: cart.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          options: buildItemOptions(item),
        })),
        payment_method: paymentMethod,
        client_order_id: orderId,
      };

      const trimmedOrderNote = orderNote.trim();
      if (trimmedOrderNote) payload.note = trimmedOrderNote;

      const trimmedName = customerName.trim();
      const trimmedPhone = customerPhone.trim();
      if (trimmedName || trimmedPhone) {
        payload.customer = {
          name: trimmedName || undefined,
          phone: trimmedPhone || undefined,
        };
      }

      const response = await storeAdminApi.createKioskOrder(payload);
      setSuccessOrder(response);
      setCart([]);
      setOrderNote("");
      setCustomerName("");
      setCustomerPhone("");
      setPaymentMethod("promptpay");
      setActiveStep("success");
      // FIX-B: reset client_order_id after successful sale
      setClientOrderId(null);
      setStockSyncFailure(null);
      toast({
        title: "บันทึกออเดอร์แล้ว",
        description: response.order_no || response.order_number || "สร้างสำเร็จ",
      });
    } catch (error: any) {
      // FIX-D: Check for structured partial-commit error
      const detail = error?.detail;
      if (detail && typeof detail === "object" && detail.code === "kiosk_order_stock_sync_failed") {
        setStockSyncFailure({
          order_id: detail.order_id,
          order_no: detail.order_no,
        });
        setSubmitError(
          "บันทึกการขายและการชำระเงินแล้ว แต่ระบบสต็อกยังซิงก์ไม่สำเร็จ ห้ามสร้างรายการขายซ้ำสำหรับออเดอร์นี้",
        );
        toast({
          title: "สต็อกซิงก์ล้มเหลว",
          description: `ออเดอร์ ${detail.order_no || detail.order_id} ชำระแล้ว ห้ามสร้างซ้ำ`,
          variant: "destructive",
        });
      } else {
        const message = error?.message || "ไม่สามารถสร้างออเดอร์ได้";
        setSubmitError(message);
        toast({ title: "เกิดข้อผิดพลาด", description: message, variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    cart,
    submitting,
    paymentMethod,
    orderNote,
    customerName,
    customerPhone,
    paymentSettingsLoading,
    noPaymentMethods,
    promptpayEnabled,
    cashEnabled,
    clientOrderId,
    stockSyncFailure,
  ]);

  return {
    // menu
    menus,
    menuLoading,
    menuError,
    reloadMenu: loadMenu,
    category,
    setCategory,
    categories,
    search,
    setSearch,
    visibleMenus,
    // cart
    cart,
    hasItems,
    orderTotal,
    removeItem,
    adjustItemQuantity,
    clearCart,
    editCartItem,
    // order meta
    orderNote,
    setOrderNote,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    // dialog
    dialogOpen,
    setDialogOpen,
    dialogProduct,
    dialogDraft,
    editingIndex,
    openItemDialog,
    persistDraft,
    incrementDraftQuantity,
    decrementDraftQuantity,
    setDraftSweetness,
    setDraftNote,
    setDraftAddonQuantity,
    // steps
    activeStep,
    goToMenu,
    goToPayment,
    resetFlow,
    // payment & submit
    paymentMethod,
    setPaymentMethod,
    submitError,
    submitting,
    successOrder,
    handleSubmit,
    paymentSettings,
    paymentSettingsLoading,
    paymentSettingsError,
    reloadPaymentSettings: loadPaymentSettings,
    availablePaymentMethods,
    noPaymentMethods,
    // FIX-B/D
    clientOrderId,
    stockSyncFailure,
  };
}

export type UseKioskOrder = ReturnType<typeof useKioskOrder>;
