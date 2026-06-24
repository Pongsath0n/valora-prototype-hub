import { describe, expect, it } from "vitest";
import { getLoginValidationMessage, LOGIN_ERROR_MESSAGES } from "./loginMessages";

describe("getLoginValidationMessage", () => {
  it("requires both email and password", () => {
    expect(getLoginValidationMessage("", "")).toBe(LOGIN_ERROR_MESSAGES.emptyCredentials);
  });

  it("trims the email before validation", () => {
    expect(getLoginValidationMessage("   ", "secret"))
      .toBe(LOGIN_ERROR_MESSAGES.emptyEmail);
  });

  it("requires password when email is present", () => {
    expect(getLoginValidationMessage("user@example.com", ""))
      .toBe(LOGIN_ERROR_MESSAGES.emptyPassword);
  });

  it("returns null when both fields are present", () => {
    expect(getLoginValidationMessage("user@example.com", "secret")).toBeNull();
  });
});
