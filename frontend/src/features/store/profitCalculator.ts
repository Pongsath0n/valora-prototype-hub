import { type FeeType } from "./orderService";

export type ProfitInput = {
  channelPrice: number;
  feeType: FeeType;
  feeValue: number;
  recipeCost: number;
  packagingCost?: number;
};

export type ProfitResult = {
  channelFee: number;
  estimatedProfit: number;
};

export function calculateChannelFeeAndProfit({ channelPrice, feeType, feeValue, recipeCost, packagingCost = 0 }: ProfitInput): ProfitResult {
  const safePrice = Math.max(0, Number.isFinite(channelPrice) ? channelPrice : 0);
  const safeRecipeCost = Math.max(0, Number.isFinite(recipeCost) ? recipeCost : 0);
  const safePackaging = Math.max(0, Number.isFinite(packagingCost) ? packagingCost : 0);

  let channelFee = 0;
  if (feeType === "fixed") channelFee = Math.max(0, feeValue);
  else if (feeType === "percent") channelFee = Math.max(0, safePrice * Math.max(0, Math.min(100, feeValue)) / 100);
  // feeType none => 0

  const estimatedProfit = safePrice - safeRecipeCost - safePackaging - channelFee;
  return { channelFee, estimatedProfit };
}
