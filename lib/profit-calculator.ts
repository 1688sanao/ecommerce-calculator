export type RouteMode = "cn-jp" | "jp-eu";

export interface JapanPurchaseInputs {
  basePrice: number;
  consumptionTaxPercent: number;
  procurementFeePercent: number;
}

export interface ProfitInputs {
  cost: number;
  shipping: number;
  packaging: number;
  sellingPrice: number;
  feeRate: number;
  cnyToJpy: number;
  usdToJpy: number;
  /** 汇率波动缓冲比例，如 3 表示 3% */
  bufferPercent: number;
}

export interface ProfitResult {
  /** 统一以日元为基准的计算结果 */
  totalCostJpy: number;
  sellingPriceJpy: number;
  platformFeeJpy: number;
  netProfitJpy: number;
  netProfitRatio: number;
  /** 模式二：美元口径的售价、手续费、净利润 */
  sellingPriceUsd: number;
  platformFeeUsd: number;
  netProfitUsd: number;
  /** 实际参与计算的安全执行汇率 */
  executionRate: number;
  executionRateCurrency: "CNY" | "USD";
  baseRate: number;
  bufferPercent: number;
  /** 日欧线：本土采购核算后的实际进货成本（不含运费、包装费） */
  actualPurchaseCostJpy?: number;
}

function toNumber(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseInput(value: string): number {
  return toNumber(value);
}

/** 中日线：成本端缓冲，人民币升值 → 成本升高 */
export function getExecutionCnyToJpy(
  baseRate: number,
  bufferPercent: number
): number {
  return baseRate * (1 + bufferPercent / 100);
}

/** 日欧线：收入端缓冲，美元贬值 → 收入减少 */
export function getExecutionUsdToJpy(
  baseRate: number,
  bufferPercent: number
): number {
  return baseRate * (1 - bufferPercent / 100);
}

/** 日欧线：日本本土采购实际进货总成本 */
export function calculateJapanPurchaseCost(
  inputs: JapanPurchaseInputs
): number {
  return (
    inputs.basePrice *
    (1 +
      inputs.consumptionTaxPercent / 100 +
      inputs.procurementFeePercent / 100)
  );
}

/** 中日线：成本 CNY，其余 JPY */
export function calculateCnJp(inputs: ProfitInputs): ProfitResult {
  const executionRate = getExecutionCnyToJpy(
    inputs.cnyToJpy,
    inputs.bufferPercent
  );
  const costJpy = inputs.cost * executionRate;
  const totalCostJpy = costJpy + inputs.shipping + inputs.packaging;
  const sellingPriceJpy = inputs.sellingPrice;
  const platformFeeJpy = sellingPriceJpy * inputs.feeRate;
  const netProfitJpy = sellingPriceJpy - totalCostJpy - platformFeeJpy;
  const netProfitRatio =
    sellingPriceJpy > 0 ? (netProfitJpy / sellingPriceJpy) * 100 : 0;

  return {
    totalCostJpy,
    sellingPriceJpy,
    platformFeeJpy,
    netProfitJpy,
    netProfitRatio,
    sellingPriceUsd: 0,
    platformFeeUsd: 0,
    netProfitUsd: 0,
    executionRate,
    executionRateCurrency: "CNY",
    baseRate: inputs.cnyToJpy,
    bufferPercent: inputs.bufferPercent,
  };
}

/** 日欧线 eBay：成本/运费/包装 JPY，售价 USD */
export function calculateJpEu(inputs: ProfitInputs): ProfitResult {
  const executionRate = getExecutionUsdToJpy(
    inputs.usdToJpy,
    inputs.bufferPercent
  );
  const totalCostJpy = inputs.cost + inputs.shipping + inputs.packaging;
  const sellingPriceUsd = inputs.sellingPrice;
  const sellingPriceJpy =
    executionRate > 0 ? sellingPriceUsd * executionRate : 0;
  const platformFeeJpy = sellingPriceJpy * inputs.feeRate;
  const netProfitJpy = sellingPriceJpy - totalCostJpy - platformFeeJpy;
  const netProfitRatio =
    sellingPriceJpy > 0 ? (netProfitJpy / sellingPriceJpy) * 100 : 0;

  const usdDivisor = executionRate > 0 ? executionRate : 1;
  const platformFeeUsd = platformFeeJpy / usdDivisor;
  const netProfitUsd = netProfitJpy / usdDivisor;

  return {
    totalCostJpy,
    sellingPriceJpy,
    platformFeeJpy,
    netProfitJpy,
    netProfitRatio,
    sellingPriceUsd,
    platformFeeUsd,
    netProfitUsd,
    executionRate,
    executionRateCurrency: "USD",
    baseRate: inputs.usdToJpy,
    bufferPercent: inputs.bufferPercent,
    actualPurchaseCostJpy: inputs.cost,
  };
}

export function calculateProfit(
  mode: RouteMode,
  inputs: ProfitInputs
): ProfitResult {
  return mode === "cn-jp" ? calculateCnJp(inputs) : calculateJpEu(inputs);
}
