import { describe, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import OwnerPaymentSettingsPage from "./OwnerPaymentSettings";

const mockedGetPaymentSettings = vi.fn();
const mockedUpdatePaymentSettings = vi.fn();
const mockedUploadPaymentSettingsQr = vi.fn();
const mockedDeletePaymentSettingsQr = vi.fn();
const mockedToast = vi.fn();

vi.mock("@/services/storeAdminApi", () => ({
  storeAdminApi: {
    getPaymentSettings: (...args: any[]) => mockedGetPaymentSettings(...args),
    updatePaymentSettings: (...args: any[]) => mockedUpdatePaymentSettings(...args),
    uploadPaymentSettingsQr: (...args: any[]) => mockedUploadPaymentSettingsQr(...args),
    deletePaymentSettingsQr: (...args: any[]) => mockedDeletePaymentSettingsQr(...args),
  },
}));

vi.mock("@/components/AppLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: any[]) => mockedToast(...args),
}));

function createSettings(overrides: Partial<ReturnType<typeof baseSettings>> = {}) {
  return { ...baseSettings(), ...overrides };
}

function baseSettings() {
  return {
    store_id: "store_1",
    promptpay_display_name: null,
    is_promptpay_enabled: true,
    is_cash_enabled: true,
    promptpay_qr_storage_path: null,
    promptpay_qr_file_name: null,
    promptpay_qr_url: null,
  };
}

function resolveResponse(overrides?: Partial<ReturnType<typeof baseSettings>>) {
  return {
    store_id: "store_1",
    settings: createSettings(overrides),
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OwnerPaymentSettingsPage />
    </MemoryRouter>,
  );
}

describe("OwnerPaymentSettingsPage", () => {
  beforeEach(() => {
    mockedGetPaymentSettings.mockReset();
    mockedUpdatePaymentSettings.mockReset();
    mockedUploadPaymentSettingsQr.mockReset();
    mockedDeletePaymentSettingsQr.mockReset();
    mockedToast.mockReset();

    mockedGetPaymentSettings.mockResolvedValue(resolveResponse());
    mockedUpdatePaymentSettings.mockResolvedValue(resolveResponse());
    mockedUploadPaymentSettingsQr.mockResolvedValue(resolveResponse({ promptpay_qr_url: "https://cdn/example.png" }));
    mockedDeletePaymentSettingsQr.mockResolvedValue(resolveResponse());
  });

  it("loads and shows defaults when no QR is configured", async () => {
    renderPage();
    await waitFor(() => expect(mockedGetPaymentSettings).toHaveBeenCalledTimes(1));

    expect(await screen.findByText("ยังไม่มีรูป QR")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "PromptPay พร้อม QR" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("switch", { name: "รับเงินสดหน้าร้าน" })).toHaveAttribute("data-state", "checked");
  });

  it("prevents disabling every payment method", async () => {
    renderPage();
    await waitFor(() => expect(mockedGetPaymentSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("switch", { name: "PromptPay พร้อม QR" }));
    fireEvent.click(screen.getByRole("switch", { name: "รับเงินสดหน้าร้าน" }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า" }));

    expect(await screen.findByTestId("payment-validation")).toHaveTextContent("ต้องเปิดอย่างน้อย 1 วิธีชำระเงิน");
    expect(mockedUpdatePaymentSettings).not.toHaveBeenCalled();
  });

  it("submits edited fields to the backend", async () => {
    renderPage();
    await waitFor(() => expect(mockedGetPaymentSettings).toHaveBeenCalledTimes(1));

    const displayInput = await screen.findByLabelText("ชื่อที่แสดงใต้ QR (ถ้ามี)");
    fireEvent.change(displayInput, { target: { value: "Valora Cafe" } });
    fireEvent.click(screen.getByRole("switch", { name: "รับเงินสดหน้าร้าน" }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า" }));

    await waitFor(() => expect(mockedUpdatePaymentSettings).toHaveBeenCalledTimes(1));
    expect(mockedUpdatePaymentSettings.mock.calls[0][0]).toEqual({
      promptpay_display_name: "Valora Cafe",
      is_cash_enabled: false,
    });
  });

  it("uploads a QR file when selecting a file", async () => {
    renderPage();
    await waitFor(() => expect(mockedGetPaymentSettings).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId("qr-file-input") as HTMLInputElement;
    const file = new File(["test"], "qr.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockedUploadPaymentSettingsQr).toHaveBeenCalledTimes(1));
    expect(mockedUploadPaymentSettingsQr).toHaveBeenCalledWith(file);
  });

  it("removes QR when clicking delete", async () => {
    mockedGetPaymentSettings.mockResolvedValueOnce(
      resolveResponse({ promptpay_qr_url: "https://cdn/example.png", promptpay_qr_file_name: "qr.png" }),
    );
    renderPage();
    await waitFor(() => expect(mockedGetPaymentSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole("button", { name: "ลบรูป QR" }));
    await waitFor(() => expect(mockedDeletePaymentSettingsQr).toHaveBeenCalledTimes(1));
  });
});
