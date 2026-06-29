"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatRateForInput,
  loadExchangeRates,
  type ExchangeRateLoadStatus,
} from "@/lib/exchange-rates";
import {
  calculateJapanPurchaseCost,
  calculateProfit,
  parseInput,
  type RouteMode,
} from "@/lib/profit-calculator";

const DEFAULT_FEE_RATE = 0.15;
const DEFAULT_CNY_TO_JPY = 21;
const DEFAULT_USD_TO_JPY = 150;
const DEFAULT_BUFFER_PERCENT = 3;
const DEFAULT_JP_CONSUMPTION_TAX = 10;
const DEFAULT_JP_PROCUREMENT_FEE = 3;

interface QuickRateOption {
  label: string;
  value: number;
}

const CN_JP_FEE_PRESETS: QuickRateOption[] = [
  { label: "亚马逊服饰", value: 15 },
  { label: "亚马逊家居", value: 10 },
  { label: "乐天市场", value: 10 },
  { label: "雅虎购物", value: 6 },
];

const JP_EU_FEE_PRESETS: QuickRateOption[] = [
  { label: "eBay常规 (<$2k)", value: 15 },
  { label: "eBay高客单 (>$2k)", value: 9 },
];

type ProfitRatioLevel = "high" | "medium" | "low";

function formatMoney(value: number, decimals = 0): string {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function getProfitRatioLevel(ratio: number): ProfitRatioLevel {
  if (ratio >= 35) return "high";
  if (ratio >= 25) return "medium";
  return "low";
}

function getProfitRatioStyles(level: ProfitRatioLevel) {
  switch (level) {
    case "high":
      return {
        text: "text-green-600 font-bold",
        box: "border-green-200 bg-green-50/80",
        badge: "bg-green-100 text-green-700",
        label: "健康区间",
      };
    case "medium":
      return {
        text: "text-yellow-500 font-bold",
        box: "border-yellow-200 bg-yellow-50/80",
        badge: "bg-yellow-100 text-yellow-700",
        label: "关注区间",
      };
    case "low":
      return {
        text: "text-red-500 font-bold animate-pulse",
        box: "border-red-200 bg-red-50",
        badge: "bg-red-100 text-red-700",
        label: "警示区间",
      };
  }
}

interface NumberFieldProps {
  id: string;
  label: string;
  suffix: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  hint?: string;
}

function NumberField({
  id,
  label,
  suffix,
  value,
  onChange,
  step = "1",
  hint,
}: NumberFieldProps) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 pr-16 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          placeholder="0"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
          {suffix}
        </span>
      </div>
      {hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

function QuickRateBadge({
  label,
  value,
  isActive,
  onSelect,
  compact = false,
}: {
  label: string;
  value: number;
  isActive: boolean;
  onSelect: (value: number) => void;
  compact?: boolean;
}) {
  const displayText = compact ? `${value}%` : `${label} (${value}%)`;

  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        isActive
          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {displayText}
    </button>
  );
}

function ProcurementFeeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const numericValue = parseInput(value);
  const quickOptions = [3, 5] as const;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        采购手续费
      </span>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          placeholder="3"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
          %
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">快捷选择</span>
        {quickOptions.map((option) => (
          <QuickRateBadge
            key={option}
            label=""
            value={option}
            compact
            isActive={numericValue === option}
            onSelect={(v) => onChange(String(v))}
          />
        ))}
      </div>
      <span className="mt-1 block text-xs text-slate-400">
        可手动输入任意比例，如 4.5
      </span>
    </div>
  );
}

function PlatformFeeField({
  id,
  mode,
  value,
  onChange,
}: {
  id: string;
  mode: RouteMode;
  value: string;
  onChange: (value: string) => void;
}) {
  const numericValue = parseInput(value);
  const presets = mode === "cn-jp" ? CN_JP_FEE_PRESETS : JP_EU_FEE_PRESETS;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        平台手续费比例
      </span>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          placeholder="15"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
          %
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">
          {mode === "cn-jp" ? "日本平台预设" : "eBay 费率预设"}
        </span>
        {presets.map((preset) => (
          <QuickRateBadge
            key={`${preset.label}-${preset.value}`}
            label={preset.label}
            value={preset.value}
            isActive={numericValue === preset.value}
            onSelect={(v) => onChange(String(v))}
          />
        ))}
      </div>
      <span className="mt-1.5 block text-xs text-slate-400">
        可手动输入任意比例，点击预设标签可快速填入真实平台费率
      </span>
    </div>
  );
}

function getExchangeRateStatusText(
  status: ExchangeRateLoadStatus,
  updatedAtUtc?: string,
  error?: string
): { message: string; tone: "neutral" | "success" | "warning" | "error" } {
  switch (status) {
    case "loading":
      return { message: "正在获取最新汇率…", tone: "neutral" };
    case "api":
      return {
        message: updatedAtUtc
          ? `已从 ExchangeRate-API 自动更新（${updatedAtUtc}）`
          : "已从 ExchangeRate-API 自动更新",
        tone: "success",
      };
    case "cache":
      return {
        message: updatedAtUtc
          ? `已加载本地缓存汇率（${updatedAtUtc}，12 小时内有效）`
          : "已加载本地缓存汇率（12 小时内有效）",
        tone: "success",
      };
    case "stale-cache":
      return {
        message: `自动获取失败，已使用过期缓存${error ? `：${error}` : ""}，可手动修改`,
        tone: "warning",
      };
    case "failed":
      return {
        message: `自动获取失败${error ? `：${error}` : ""}，请手动输入汇率`,
        tone: "error",
      };
    default:
      return { message: "", tone: "neutral" };
  }
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function ProfitCalculator() {
  const [mode, setMode] = useState<RouteMode>("cn-jp");

  const [cost, setCost] = useState("");
  const [shipping, setShipping] = useState("");
  const [packaging, setPackaging] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [feeRate, setFeeRate] = useState(String(DEFAULT_FEE_RATE * 100));
  const [cnyToJpy, setCnyToJpy] = useState(String(DEFAULT_CNY_TO_JPY));
  const [usdToJpy, setUsdToJpy] = useState(String(DEFAULT_USD_TO_JPY));
  const [bufferPercent, setBufferPercent] = useState(
    String(DEFAULT_BUFFER_PERCENT)
  );
  const [jpBasePrice, setJpBasePrice] = useState("");
  const [jpConsumptionTax, setJpConsumptionTax] = useState(
    String(DEFAULT_JP_CONSUMPTION_TAX)
  );
  const [jpProcurementFee, setJpProcurementFee] = useState(
    String(DEFAULT_JP_PROCUREMENT_FEE)
  );
  const [exchangeRateStatus, setExchangeRateStatus] =
    useState<ExchangeRateLoadStatus>("loading");
  const [exchangeRateMessage, setExchangeRateMessage] = useState("");
  const [exchangeRateTone, setExchangeRateTone] = useState<
    "neutral" | "success" | "warning" | "error"
  >("neutral");

  useEffect(() => {
    let cancelled = false;

    async function initExchangeRates() {
      setExchangeRateStatus("loading");
      setExchangeRateMessage("正在获取最新汇率…");
      setExchangeRateTone("neutral");

      const result = await loadExchangeRates();
      if (cancelled) return;

      if (result.rates) {
        setCnyToJpy(formatRateForInput(result.rates.cnyToJpy));
        setUsdToJpy(formatRateForInput(result.rates.usdToJpy));
      }

      setExchangeRateStatus(result.status);

      const statusText = getExchangeRateStatusText(
        result.status,
        result.rates?.updatedAtUtc,
        result.error
      );
      setExchangeRateMessage(statusText.message);
      setExchangeRateTone(statusText.tone);
    }

    void initExchangeRates();

    return () => {
      cancelled = true;
    };
  }, []);

  const actualPurchaseCostJpy = useMemo(() => {
    return calculateJapanPurchaseCost({
      basePrice: parseInput(jpBasePrice),
      consumptionTaxPercent: parseInput(jpConsumptionTax),
      procurementFeePercent: parseInput(jpProcurementFee),
    });
  }, [jpBasePrice, jpConsumptionTax, jpProcurementFee]);

  const resolvedCost =
    mode === "jp-eu" ? actualPurchaseCostJpy : parseInput(cost);

  const result = useMemo(() => {
    return calculateProfit(mode, {
      cost: resolvedCost,
      shipping: parseInput(shipping),
      packaging: parseInput(packaging),
      sellingPrice: parseInput(sellingPrice),
      feeRate: parseInput(feeRate) / 100,
      cnyToJpy: parseInput(cnyToJpy),
      usdToJpy: parseInput(usdToJpy),
      bufferPercent: parseInput(bufferPercent),
    });
  }, [
    mode,
    resolvedCost,
    shipping,
    packaging,
    sellingPrice,
    feeRate,
    cnyToJpy,
    usdToJpy,
    bufferPercent,
  ]);

  const ratioLevel = getProfitRatioLevel(result.netProfitRatio);
  const ratioStyles = getProfitRatioStyles(ratioLevel);

  const netProfitDisplay =
    mode === "cn-jp"
      ? `¥${formatMoney(result.netProfitJpy)}`
      : `$${formatMoney(result.netProfitUsd, 2)}`;

  const netProfitPositive = result.netProfitJpy >= 0;

  const executionRateHint =
    result.executionRateCurrency === "CNY"
      ? `当前计算已应用安全汇率：1 CNY = ${formatMoney(result.executionRate, 2)} JPY`
      : `当前计算已应用安全汇率：1 USD = ${formatMoney(result.executionRate, 2)} JPY`;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {/* 页头 */}
        <header className="mb-8">
          <p className="text-sm font-medium text-slate-500">跨境电商工具</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            电商利润计算器
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            支持中日线与日欧线 eBay 双模式，输入参数后实时计算总成本、平台手续费与净利润。
          </p>
        </header>

        {/* 路由切换 */}
        <div className="mb-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode("cn-jp")}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition ${
              mode === "cn-jp"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            中日线
          </button>
          <button
            type="button"
            onClick={() => setMode("jp-eu")}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition ${
              mode === "jp-eu"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            日欧线 · eBay
          </button>
        </div>

        {/* 左右分栏 */}
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
          {/* 左侧：输入参数区 */}
          <div className="space-y-5 lg:col-span-3">
            <Card
              title="汇率设置"
              description="页面加载时自动获取最新汇率，也可随时手动修改。"
            >
              <div
                className={`mb-4 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed ${
                  exchangeRateTone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : exchangeRateTone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : exchangeRateTone === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {exchangeRateStatus === "loading" ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    {exchangeRateMessage || "正在获取最新汇率…"}
                  </span>
                ) : (
                  exchangeRateMessage
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id="cny-jpy"
                  label="人民币兑日元 (CNY → JPY)"
                  suffix="JPY"
                  value={cnyToJpy}
                  onChange={setCnyToJpy}
                  step="0.01"
                  hint="1 人民币 = ? 日元"
                />
                <NumberField
                  id="usd-jpy"
                  label="美元兑日元 (USD → JPY)"
                  suffix="JPY"
                  value={usdToJpy}
                  onChange={setUsdToJpy}
                  step="0.01"
                  hint="1 美元 = ? 日元"
                />
              </div>
            </Card>

            <Card
              title="输入参数"
              description={
                mode === "cn-jp"
                  ? "进货成本以人民币计，运费、包装费与售价以日元计。"
                  : "本土采购以日元核算，运费、包装费以日元计，售价以美元计。"
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {mode === "cn-jp" ? (
                  <NumberField
                    id="cost"
                    label="进货成本"
                    suffix="CNY"
                    value={cost}
                    onChange={setCost}
                    step="0.01"
                  />
                ) : (
                  <div className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-800">
                        日本本土采购核算
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        实际进货总成本 = 商品本体价格 × (1 + 消费税% + 采购手续费%)
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NumberField
                        id="jp-base-price"
                        label="商品本体价格"
                        suffix="JPY"
                        value={jpBasePrice}
                        onChange={setJpBasePrice}
                        step="1"
                      />
                      <NumberField
                        id="jp-consumption-tax"
                        label="日本消费税"
                        suffix="%"
                        value={jpConsumptionTax}
                        onChange={setJpConsumptionTax}
                        step="0.1"
                        hint="默认 10%"
                      />
                      <div className="sm:col-span-2">
                        <ProcurementFeeField
                          id="jp-procurement-fee"
                          value={jpProcurementFee}
                          onChange={setJpProcurementFee}
                        />
                      </div>
                    </div>
                    {actualPurchaseCostJpy > 0 && (
                      <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                        <span className="text-xs font-medium text-slate-500">
                          实际进货总成本
                        </span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-slate-800">
                          ¥{formatMoney(actualPurchaseCostJpy)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <NumberField
                  id="shipping"
                  label="运费"
                  suffix="JPY"
                  value={shipping}
                  onChange={setShipping}
                  step="1"
                />
                <NumberField
                  id="packaging"
                  label="包装费"
                  suffix="JPY"
                  value={packaging}
                  onChange={setPackaging}
                  step="1"
                />
                <NumberField
                  id="selling-price"
                  label="售价"
                  suffix={mode === "cn-jp" ? "JPY" : "USD"}
                  value={sellingPrice}
                  onChange={setSellingPrice}
                  step="0.01"
                />
                <NumberField
                  id="buffer-percent"
                  label="汇率波动缓冲"
                  suffix="%"
                  value={bufferPercent}
                  onChange={setBufferPercent}
                  step="0.1"
                  hint={
                    mode === "cn-jp"
                      ? "成本端缓冲：执行汇率 = 基础汇率 × (1 + 缓冲%)"
                      : "收入端缓冲：执行汇率 = 基础汇率 × (1 − 缓冲%)"
                  }
                />
                <div className="sm:col-span-2">
                  <PlatformFeeField
                    id="fee-rate"
                    mode={mode}
                    value={feeRate}
                    onChange={setFeeRate}
                  />
                </div>
              </div>
            </Card>

            <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5">
              <p className="text-sm font-medium text-slate-700">计算公式</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-500">
                {mode === "jp-eu" && (
                  <li>
                    实际进货总成本 = 商品本体价格 × (1 + 日本消费税% + 采购手续费%)
                  </li>
                )}
                <li>执行汇率 = 基础汇率 × (1 ± 缓冲比例)，按悲观原则取不利方向</li>
                <li>
                  总成本 ={" "}
                  {mode === "cn-jp"
                    ? "进货成本（安全汇率转换）"
                    : "实际进货总成本"}
                  + 运费 + 包装费
                </li>
                <li>平台手续费 = 售价 × 手续费比例</li>
                <li>绝对净利润 = 售价 − 总成本 − 平台手续费</li>
                <li>绝对净利润比例 =（绝对净利润 ÷ 售价）× 100%</li>
              </ul>
            </section>
          </div>

          {/* 右侧：结果看板区 */}
          <div className="lg:col-span-2">
            <div className="sticky top-6 space-y-4">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-900 px-6 py-4">
                  <h2 className="text-base font-semibold text-white">结果看板</h2>
                  <p className="mt-0.5 text-xs text-slate-300">
                    {mode === "cn-jp" ? "中日线 · 日元口径" : "日欧线 · 美元售价口径"}
                  </p>
                </div>

                <div className="space-y-4 p-6">
                  {/* 核心 KPI：绝对净利润 */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                    <p className="text-sm font-medium text-slate-500">
                      绝对净利润
                    </p>
                    <p
                      className={`mt-2 font-mono text-4xl font-bold tabular-nums tracking-tight ${
                        netProfitPositive ? "text-slate-900" : "text-red-600"
                      }`}
                    >
                      {netProfitDisplay}
                    </p>
                    {mode === "jp-eu" && (
                      <p className="mt-2 text-xs text-slate-400">
                        参考（日元）：¥{formatMoney(result.netProfitJpy)}
                      </p>
                    )}
                    <p className="mt-3 text-xs leading-relaxed text-slate-400">
                      {executionRateHint}
                      <span className="block mt-0.5 text-slate-300">
                        （基础汇率 {formatMoney(result.baseRate, 2)} JPY，缓冲{" "}
                        {formatMoney(result.bufferPercent, 1)}%）
                      </span>
                    </p>
                  </div>

                  {/* 核心 KPI：绝对净利润比例 + 红绿灯 */}
                  <div
                    className={`rounded-xl border p-5 transition-colors ${ratioStyles.box}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-600">
                        绝对净利润比例
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ratioStyles.badge}`}
                      >
                        {ratioStyles.label}
                      </span>
                    </div>
                    <p
                      className={`mt-2 font-mono text-4xl tabular-nums tracking-tight ${ratioStyles.text}`}
                    >
                      {formatPercent(result.netProfitRatio)}
                    </p>
                  </div>

                  {/* 明细项 */}
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {mode === "jp-eu" && result.actualPurchaseCostJpy !== undefined && (
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <span className="text-sm text-slate-500">实际进货总成本</span>
                        <span className="font-mono text-sm font-medium tabular-nums text-slate-800">
                          ¥{formatMoney(result.actualPurchaseCostJpy)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-sm text-slate-500">总成本</span>
                      <span className="font-mono text-sm font-medium tabular-nums text-slate-800">
                        ¥{formatMoney(result.totalCostJpy)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-sm text-slate-500">平台手续费</span>
                      <span className="font-mono text-sm font-medium tabular-nums text-slate-800">
                        {mode === "cn-jp"
                          ? `¥${formatMoney(result.platformFeeJpy)}`
                          : `$${formatMoney(result.platformFeeUsd, 2)}`}
                      </span>
                    </div>
                  </div>

                  {/* 红绿灯图例 */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-medium text-slate-500">
                      利润率预警规则
                    </p>
                    <ul className="space-y-2 text-xs text-slate-600">
                      <li className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-green-600" />
                        <span>
                          <strong className="text-green-600">≥ 35%</strong>
                          ：深绿色，健康利润
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                        <span>
                          <strong className="text-yellow-500">25% ~ 35%</strong>
                          ：明黄色，需关注
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                        <span>
                          <strong className="text-red-500">&lt; 25%</strong>
                          ：警示红闪烁，利润偏低
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
