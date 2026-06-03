import type { Exchange } from "@/lib/bot/scanner";
import {
  displaySymbolFromCcxt,
  filterValidSymbols,
  listInvalidSymbols,
  resolveCcxtSymbol,
} from "@/lib/bot/symbols";
import type { BotSettings, MarketKind, PositionInfo, Side } from "@/lib/storage/types";

export type TradeResult = {
  entry: { id?: string };
  amount: number;
  fillPrice: number;
  stop: number;
  takeProfit: number;
  warnings?: string[];
};

function ccxtErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: string }).message);
  }
  return String(error);
}

function orderSide(side: Side): "buy" | "sell" {
  return side === "long" ? "buy" : "sell";
}

function closeSide(side: Side): "buy" | "sell" {
  return side === "long" ? "sell" : "buy";
}

async function fetchFillPrice(
  exchange: Exchange,
  ccxtSymbol: string,
  entryOrder: { average?: number; price?: number },
): Promise<number> {
  const fromOrder = Number(entryOrder.average ?? entryOrder.price ?? 0);
  if (fromOrder > 0) return fromOrder;

  const ticker = await exchange.fetchTicker(ccxtSymbol);
  const info = ticker.info as { markPrice?: string } | undefined;
  const mark = info?.markPrice ? Number(info.markPrice) : undefined;
  return Number(ticker.last ?? mark ?? 0);
}

function protectivePrices(
  side: Side,
  fillPrice: number,
  markPrice: number,
  stopDistance: number,
  tpDistance: number,
): { stop: number; takeProfit: number } {
  const mark = markPrice > 0 ? markPrice : fillPrice;
  const buffer = mark * 0.002;

  let stop = side === "long" ? fillPrice - stopDistance : fillPrice + stopDistance;
  let takeProfit = side === "long" ? fillPrice + tpDistance : fillPrice - tpDistance;

  if (side === "long") {
    if (stop >= mark - buffer) stop = mark - buffer;
    if (takeProfit <= mark + buffer) takeProfit = mark + buffer;
  } else {
    if (stop <= mark + buffer) stop = mark + buffer;
    if (takeProfit >= mark - buffer) takeProfit = mark - buffer;
  }

  return { stop, takeProfit };
}

export async function setupMarket(
  exchange: Exchange,
  settings: BotSettings,
  market: MarketKind,
): Promise<void> {
  if (market !== "futures") return;

  const valid = filterValidSymbols(exchange, settings.symbols, market);
  const invalid = listInvalidSymbols(exchange, settings.symbols, market);
  if (invalid.length) {
    console.warn(`Skipping invalid futures symbols for leverage: ${invalid.join(", ")}`);
  }

  for (const symbol of valid) {
    const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, market)!;
    try {
      await exchange.setLeverage(settings.leverage, ccxtSymbol);
    } catch (error) {
      console.warn(`Could not set leverage on ${symbol}:`, error);
    }
  }
}

export async function setSymbolLeverage(
  exchange: Exchange,
  symbol: string,
  leverage: number,
): Promise<void> {
  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "futures");
  if (!ccxtSymbol) throw new Error(`Unknown futures symbol: ${symbol}`);
  try {
    await exchange.setLeverage(leverage, ccxtSymbol);
  } catch (error) {
    console.warn(`Could not set leverage on ${symbol}:`, error);
  }
}

function validateFuturesOrder(
  exchange: Exchange,
  ccxtSymbol: string,
  amount: number,
  price: number,
): void {
  const market = exchange.markets[ccxtSymbol];
  if (!market) throw new Error(`Market not found: ${ccxtSymbol}`);

  const minAmount = Number(market.limits?.amount?.min ?? 0);
  if (minAmount > 0 && amount < minAmount) {
    throw new Error(`Order size ${amount} is below minimum ${minAmount} for ${ccxtSymbol}`);
  }

  const minCost = Number(market.limits?.cost?.min ?? 0);
  const notional = amount * price;
  if (minCost > 0 && notional < minCost) {
    throw new Error(
      `Order notional ${notional.toFixed(2)} USDT is below minimum ${minCost} USDT for ${ccxtSymbol}`,
    );
  }
}

async function openFuturesPosition(
  exchange: Exchange,
  symbol: string,
  side: Side,
  size: number,
  stopDistance: number,
  tpDistance: number,
): Promise<TradeResult> {
  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "futures");
  if (!ccxtSymbol) {
    throw new Error(`Unknown futures symbol: ${symbol}`);
  }

  const ticker = await exchange.fetchTicker(ccxtSymbol);
  const info = ticker.info as { markPrice?: string } | undefined;
  const markFromInfo = info?.markPrice ? Number(info.markPrice) : 0;
  const markPrice = Number(ticker.last ?? markFromInfo ?? 0);

  const amount = Number(await exchange.amountToPrecision(ccxtSymbol, size));
  if (amount <= 0) {
    throw new Error(`Order size rounds to zero for ${symbol}. Increase amount.`);
  }

  validateFuturesOrder(exchange, ccxtSymbol, amount, markPrice > 0 ? markPrice : 1);

  let entryOrder;
  try {
    entryOrder = await exchange.createOrder(ccxtSymbol, "market", orderSide(side), amount);
  } catch (error) {
    throw new Error(`Entry order failed: ${ccxtErrorMessage(error)}`);
  }

  const fillPrice = await fetchFillPrice(exchange, ccxtSymbol, entryOrder);
  if (fillPrice <= 0) {
    throw new Error(`No fill price returned for ${symbol}`);
  }

  const effectiveMark = markPrice > 0 ? markPrice : fillPrice;
  const { stop, takeProfit } = protectivePrices(
    side,
    fillPrice,
    effectiveMark,
    stopDistance,
    tpDistance,
  );

  const stopPrice = Number(await exchange.priceToPrecision(ccxtSymbol, stop));
  const tpPrice = Number(await exchange.priceToPrecision(ccxtSymbol, takeProfit));
  const close = closeSide(side);
  const orderParams = { reduceOnly: true, workingType: "MARK_PRICE" as const };

  let slOk = false;
  let tpOk = false;
  const warnings: string[] = [];

  try {
    await exchange.createOrder(ccxtSymbol, "STOP_MARKET", close, amount, undefined, {
      ...orderParams,
      stopPrice,
    });
    slOk = true;
  } catch (error) {
    console.error(`Failed to place futures stop-loss on ${symbol}:`, error);
    warnings.push(`Stop-loss not placed: ${ccxtErrorMessage(error)}`);
  }

  try {
    await exchange.createOrder(ccxtSymbol, "TAKE_PROFIT_MARKET", close, amount, undefined, {
      ...orderParams,
      stopPrice: tpPrice,
    });
    tpOk = true;
  } catch (error) {
    console.error(`Failed to place futures take-profit on ${symbol}:`, error);
    warnings.push(`Take-profit not placed: ${ccxtErrorMessage(error)}`);
  }

  if (!slOk && !tpOk) {
    warnings.push("Position opened without stop-loss or take-profit.");
  } else if (!slOk || !tpOk) {
    console.warn(`${symbol} partial futures protection SL=${slOk} TP=${tpOk}`);
  }

  return {
    entry: { id: entryOrder.id },
    amount,
    fillPrice,
    stop: stopPrice,
    takeProfit: tpPrice,
    warnings: warnings.length ? warnings : undefined,
  };
}

async function spotBuy(
  exchange: Exchange,
  symbol: string,
  size: number,
  stopDistance: number,
  tpDistance: number,
): Promise<TradeResult | null> {
  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "spot");
  if (!ccxtSymbol) {
    console.error(`Unknown spot symbol: ${symbol}`);
    return null;
  }

  const amount = Number(await exchange.amountToPrecision(ccxtSymbol, size));
  if (amount <= 0) return null;

  let entryOrder;
  try {
    entryOrder = await exchange.createOrder(ccxtSymbol, "market", "buy", amount);
  } catch (error) {
    console.error(`Failed to spot buy ${symbol}:`, error);
    return null;
  }

  const fillPrice = await fetchFillPrice(exchange, ccxtSymbol, entryOrder);
  if (fillPrice <= 0) return null;

  const ticker = await exchange.fetchTicker(ccxtSymbol);
  const markPrice = Number(ticker.last ?? fillPrice);
  const { stop, takeProfit } = protectivePrices(
    "long",
    fillPrice,
    markPrice,
    stopDistance,
    tpDistance,
  );

  const stopPrice = Number(await exchange.priceToPrecision(ccxtSymbol, stop));
  const tpPrice = Number(await exchange.priceToPrecision(ccxtSymbol, takeProfit));
  const stopLimitPrice = Number(await exchange.priceToPrecision(ccxtSymbol, stop * 0.999));
  const tpLimitPrice = Number(await exchange.priceToPrecision(ccxtSymbol, takeProfit));

  let slOk = false;
  let tpOk = false;

  try {
    await exchange.createOrder(ccxtSymbol, "STOP_LOSS_LIMIT", "sell", amount, stopLimitPrice, {
      stopPrice,
    });
    slOk = true;
  } catch (error) {
    console.error(`Failed to place spot stop-loss on ${symbol}:`, error);
  }

  try {
    await exchange.createOrder(ccxtSymbol, "TAKE_PROFIT_LIMIT", "sell", amount, tpLimitPrice, {
      stopPrice: tpPrice,
    });
    tpOk = true;
  } catch (error) {
    console.error(`Failed to place spot take-profit on ${symbol}:`, error);
  }

  if (!slOk || !tpOk) {
    console.warn(`${symbol} partial spot protection SL=${slOk} TP=${tpOk}`);
  }

  return {
    entry: { id: entryOrder.id },
    amount,
    fillPrice,
    stop: stopPrice,
    takeProfit: tpPrice,
  };
}

async function spotSell(exchange: Exchange, symbol: string): Promise<TradeResult | null> {
  const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "spot");
  if (!ccxtSymbol) {
    console.error(`Unknown spot symbol: ${symbol}`);
    return null;
  }

  const balance = await exchange.fetchBalance();
  const base = ccxtSymbol.split("/")[0] ?? "";
  const free = Number((balance[base] as { free?: number } | undefined)?.free ?? 0);
  if (free <= 0) return null;

  const amount = Number(await exchange.amountToPrecision(ccxtSymbol, free));
  if (amount <= 0) return null;

  try {
    const openOrders = await exchange.fetchOpenOrders(ccxtSymbol);
    for (const order of openOrders) {
      if (order.id) await exchange.cancelOrder(order.id, ccxtSymbol);
    }
  } catch (error) {
    console.warn(`Could not cancel spot orders for ${symbol}:`, error);
  }

  let exitOrder;
  try {
    exitOrder = await exchange.createOrder(ccxtSymbol, "market", "sell", amount);
  } catch (error) {
    console.error(`Failed to spot sell ${symbol}:`, error);
    return null;
  }

  const fillPrice = await fetchFillPrice(exchange, ccxtSymbol, exitOrder);
  return {
    entry: { id: exitOrder.id },
    amount,
    fillPrice,
    stop: 0,
    takeProfit: 0,
  };
}

export async function executeSignal(
  exchange: Exchange,
  market: MarketKind,
  symbol: string,
  side: Side,
  action: "BUY" | "SELL",
  size: number,
  stopDistance: number,
  tpDistance: number,
): Promise<TradeResult | null> {
  if (market === "futures") {
    return openFuturesPosition(exchange, symbol, side, size, stopDistance, tpDistance);
  }

  if (action === "BUY") {
    return spotBuy(exchange, symbol, size, stopDistance, tpDistance);
  }

  return spotSell(exchange, symbol);
}

export async function syncPositions(
  exchange: Exchange,
  market: MarketKind,
  settings: BotSettings,
): Promise<PositionInfo[]> {
  if (market === "futures") {
    const raw = await exchange.fetchPositions();
    const positions: PositionInfo[] = [];

    for (const pos of raw) {
      const contracts = Math.abs(Number(pos.contracts ?? 0));
      if (contracts <= 0) continue;

      const ccxtSymbol = String(pos.symbol ?? "");
      const info = pos.info as { markPrice?: string; unRealizedProfit?: string } | undefined;
      const markPrice = Number(pos.markPrice ?? info?.markPrice ?? 0);
      const entryPrice = Number(pos.entryPrice ?? 0);
      const returnUsdt = Number(pos.unrealizedPnl ?? info?.unRealizedProfit ?? 0);
      const returnPct = Number(pos.percentage ?? 0);
      let notionalUsdt = Number(pos.notional ?? 0);
      if (notionalUsdt <= 0 && markPrice > 0) notionalUsdt = contracts * markPrice;
      else if (notionalUsdt <= 0 && entryPrice > 0) notionalUsdt = contracts * entryPrice;

      positions.push({
        market: "futures",
        symbol: displaySymbolFromCcxt(ccxtSymbol, exchange),
        side: pos.side === "long" ? "long" : "short",
        size: contracts,
        entryPrice,
        markPrice: markPrice > 0 ? markPrice : undefined,
        notionalUsdt: notionalUsdt > 0 ? notionalUsdt : undefined,
        returnUsdt,
        returnPct,
        timeframe: settings.timeframe,
      });
    }

    return positions;
  }

  const positions: PositionInfo[] = [];
  for (const symbol of settings.symbols) {
    const ccxtSymbol = resolveCcxtSymbol(exchange, symbol, "spot");
    if (!ccxtSymbol) continue;

    const base = ccxtSymbol.split("/")[0] ?? "";
    const balance = await exchange.fetchBalance();
    const total = Number((balance[base] as { total?: number } | undefined)?.total ?? 0);
    if (total <= 0) continue;

    let entryPrice = 0;
    try {
      const ticker = await exchange.fetchTicker(ccxtSymbol);
      entryPrice = Number(ticker.last ?? 0);
    } catch {
      /* use 0 */
    }

    positions.push({
      market: "spot",
      symbol,
      side: "long",
      size: total,
      entryPrice,
    });
  }

  return positions;
}

export async function updateStops(
  exchange: Exchange,
  market: MarketKind,
  positions: PositionInfo[],
): Promise<void> {
  for (const pos of positions) {
    const ccxtSymbol = resolveCcxtSymbol(exchange, pos.symbol, market);
    if (!ccxtSymbol) continue;

    try {
      const openOrders = await exchange.fetchOpenOrders(ccxtSymbol);
      const hasSl = openOrders.some((o: { type?: string }) => {
        const type = String(o.type ?? "").toUpperCase();
        return type.includes("STOP");
      });
      const hasTp = openOrders.some((o: { type?: string }) => {
        const type = String(o.type ?? "").toUpperCase();
        return type.includes("TAKE_PROFIT");
      });
      if (!hasSl || !hasTp) {
        console.warn(`${pos.symbol} (${market}) missing protective orders SL=${hasSl} TP=${hasTp}`);
      }
    } catch (error) {
      console.warn(`Could not fetch open orders for ${pos.symbol} (${market}):`, error);
    }
  }
}
