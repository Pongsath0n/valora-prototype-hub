import AdminLayout from "@/components/admin/AdminLayout";
import {
  CartPanel,
  ItemOptionsDialog,
  KioskStepIndicator,
  MenuBrowser,
  PaymentPanel,
  SuccessPanel,
} from "@/components/staff/kiosk";
import { STEPS, useKioskOrder } from "@/features/staff/kiosk";

/**
 * Staff Kiosk — walk-in order creation.
 *
 * Thin orchestrator: all state/logic lives in `useKioskOrder`, all UI lives in
 * `@/components/staff/kiosk`. This page only wires the hook to the right panel
 * for the active step, keeping the three steps cleanly separated.
 */
export default function StaffKioskPage() {
  const kiosk = useKioskOrder();

  return (
    <AdminLayout title="Staff Kiosk" subtitle="สร้างออเดอร์ walk-in ที่ปลอดภัยและเชื่อมต่อคิวอัตโนมัติ">
      <div className="space-y-6">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <KioskStepIndicator steps={STEPS} activeStep={kiosk.activeStep} />
        </div>

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
    </AdminLayout>
  );
}
