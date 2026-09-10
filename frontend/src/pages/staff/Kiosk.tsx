import { useRef } from "react";
import { ArrowRight, ShoppingBag } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  CartPanel,
  ItemOptionsDialog,
  KioskIncomingAlert,
  KioskStepIndicator,
  MenuBrowser,
  PaymentPanel,
  SuccessPanel,
} from "@/components/staff/kiosk";
import { STEPS, useKioskOrder, useKioskIncomingAlert, formatCurrency } from "@/features/staff/kiosk";

/**
 * Staff Kiosk — walk-in order creation.
 *
 * Thin orchestrator: all state/logic lives in `useKioskOrder`, all UI lives in
 * `@/components/staff/kiosk`. This page only wires the hook to the right panel
 * for the active step, keeping the three steps cleanly separated.
 */
export default function StaffKioskPage() {
  const kiosk = useKioskOrder();
  const incomingAlert = useKioskIncomingAlert();
  const cartRef = useRef<HTMLDivElement>(null);

  function scrollCartIntoView() {
    cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <AdminLayout title="Staff Kiosk" subtitle="สร้างออเดอร์ walk-in ที่ปลอดภัยและเชื่อมต่อคิวอัตโนมัติ">
      <div className="space-y-6">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <KioskStepIndicator steps={STEPS} activeStep={kiosk.activeStep} />
        </div>

        {/* PF-03: Kiosk-side operational VIEW of the canonical Incoming Queue.
            Persistent indicator + aggregated new-order notice + counter
            payment reuse. Does NOT duplicate the Incoming Queue engine or
            copy Self-orders into the Kiosk cart. */}
        <KioskIncomingAlert alert={incomingAlert} />

        {kiosk.activeStep === "menu" ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <MenuBrowser
              search={kiosk.search}
              onSearchChange={kiosk.setSearch}
              categories={kiosk.categories}
              activeCategory={kiosk.category}
              onCategoryChange={kiosk.setCategory}
              menuLoading={kiosk.menuLoading}
              menuError={kiosk.menuError}
              onReload={kiosk.reloadMenu}
              visibleMenus={kiosk.visibleMenus}
              onSelectProduct={(product) => kiosk.openItemDialog(product, null)}
            />
            <div ref={cartRef} className="scroll-mt-20">
              <CartPanel
                cart={kiosk.cart}
                orderTotal={kiosk.orderTotal}
                hasItems={kiosk.hasItems}
                onAdjustQuantity={kiosk.adjustItemQuantity}
                onEditItem={kiosk.editCartItem}
                onRemoveItem={kiosk.removeItem}
                onClearCart={kiosk.clearCart}
                onNext={kiosk.goToPayment}
                orderNote={kiosk.orderNote}
                onOrderNoteChange={kiosk.setOrderNote}
                customerName={kiosk.customerName}
                onCustomerNameChange={kiosk.setCustomerName}
                customerPhone={kiosk.customerPhone}
                onCustomerPhoneChange={kiosk.setCustomerPhone}
              />
            </div>
          </div>
        ) : null}

        {kiosk.activeStep === "payment" ? (
          <PaymentPanel
            cart={kiosk.cart}
            orderTotal={kiosk.orderTotal}
            paymentMethod={kiosk.paymentMethod}
            onPaymentMethodChange={kiosk.setPaymentMethod}
            submitting={kiosk.submitting}
            submitError={kiosk.submitError}
            onConfirm={kiosk.handleSubmit}
            onBack={kiosk.goToMenu}
            paymentSettingsLoading={kiosk.paymentSettingsLoading}
            paymentSettingsError={kiosk.paymentSettingsError}
            onReloadPaymentSettings={kiosk.reloadPaymentSettings}
            availableMethods={kiosk.availablePaymentMethods}
            noPaymentMethods={kiosk.noPaymentMethods}
            qrImageUrl={kiosk.paymentSettings?.promptpay_qr_url}
            promptpayDisplayName={kiosk.paymentSettings?.promptpay_display_name}
            stockSyncFailure={kiosk.stockSyncFailure}
          />
        ) : null}

        {kiosk.activeStep === "success" && kiosk.successOrder ? (
          <SuccessPanel
            order={kiosk.successOrder}
            fallbackTotal={kiosk.orderTotal}
            fallbackMethod={kiosk.paymentMethod}
            onReset={kiosk.resetFlow}
          />
        ) : null}
      </div>

      <ItemOptionsDialog
        open={kiosk.dialogOpen}
        onOpenChange={kiosk.setDialogOpen}
        product={kiosk.dialogProduct}
        draft={kiosk.dialogDraft}
        isEditing={kiosk.editingIndex != null}
        onIncrementQuantity={kiosk.incrementDraftQuantity}
        onDecrementQuantity={kiosk.decrementDraftQuantity}
        onSweetnessChange={kiosk.setDraftSweetness}
        onNoteChange={kiosk.setDraftNote}
        onAddonQuantityChange={kiosk.setDraftAddonQuantity}
        onConfirm={kiosk.persistDraft}
      />

      {/* Mobile floating cart CTA — jumps to the cart panel when the product
          list is long. Desktop has a sticky sidebar cart so this is hidden. */}
      {kiosk.activeStep === "menu" && kiosk.hasItems ? (
        <button
          type="button"
          onClick={scrollCartIntoView}
          className="fixed bottom-16 left-4 right-4 z-30 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg transition hover:opacity-90 lg:hidden"
          aria-label="ดูตะกร้าและไปชำระเงิน"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag className="h-4 w-4" />
            ตะกร้า {kiosk.cart.length} รายการ
          </span>
          <span className="flex items-center gap-2 text-sm font-bold tabular-nums">
            {formatCurrency(kiosk.orderTotal)}
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      ) : null}
    </AdminLayout>
  );
}
