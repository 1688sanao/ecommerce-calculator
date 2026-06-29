import { NextResponse } from "next/server";

interface ExchangeRateApiResponse {
  result: string;
  base_code: string;
  time_last_update_utc?: string;
  conversion_rates?: Record<string, number>;
}

export async function GET() {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 EXCHANGE_RATE_API_KEY 环境变量" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/JPY`,
      { next: { revalidate: 43200 } }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "汇率服务商响应异常" },
        { status: response.status }
      );
    }

    const data = (await response.json()) as ExchangeRateApiResponse;

    if (data.result !== "success" || !data.conversion_rates) {
      return NextResponse.json(
        { error: "汇率数据解析失败" },
        { status: 502 }
      );
    }

    const cnyPerJpy = data.conversion_rates.CNY;
    const usdPerJpy = data.conversion_rates.USD;

    if (!cnyPerJpy || !usdPerJpy || cnyPerJpy <= 0 || usdPerJpy <= 0) {
      return NextResponse.json(
        { error: "缺少 CNY 或 USD 汇率数据" },
        { status: 502 }
      );
    }

    const cnyToJpy = 1 / cnyPerJpy;
    const usdToJpy = 1 / usdPerJpy;

    return NextResponse.json({
      cnyToJpy: Number(cnyToJpy.toFixed(4)),
      usdToJpy: Number(usdToJpy.toFixed(4)),
      updatedAtUtc: data.time_last_update_utc,
    });
  } catch {
    return NextResponse.json({ error: "汇率获取失败" }, { status: 500 });
  }
}
