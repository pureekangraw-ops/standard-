function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label}ไม่ถูกต้อง`);
  return number;
}

function money(value, label, allowZero = true) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1)) throw new Error(`${label}ไม่ถูกต้อง`);
  return number;
}

function catalogMeta(input) {
  return {
    productId: input.productId || null,
    variantId: input.variantId || null,
    optionSnapshot: input.optionSnapshot ? structuredClone(input.optionSnapshot) : {},
    productName: String(input.productName || "")
  };
}

export function buildPurchaseEffects(input) {
  const qty = positiveInteger(input.qty, "จำนวนรับเข้า");
  const costSatang = money(input.costSatang, "ต้นทุนรวม");
  const purchase = {
    id: input.id,
    name: String(input.productName || "สินค้าเข้า"),
    qty,
    costSatang,
    paidAmountSatang: costSatang,
    status: "ACTIVE",
    date: input.date,
    createdAt: input.at,
    updatedAt: input.at,
    revision: 1,
    cancelledAt: null,
    ...catalogMeta(input)
  };
  const transactions = costSatang > 0 ? [{
    owner: "FINANCE", direction: "OUT", amountSatang: costSatang,
    subtype: "PURCHASE_PAYMENT", actionKey: `${input.id}:purchase`
  }] : [];
  const calendarEffects = input.due ? [{
    owner: "CALENDAR", type: "CREATE_PURCHASE_RETURN_QUEUE", source: "STORE", sourceId: input.id,
    actionType: "PURCHASE_RETURN_WINDOW", amountSatang: costSatang, due: input.due
  }] : [];
  return { purchase, transactions, calendarEffects };
}

export function buildWithdrawalRecord(input) {
  return {
    id: input.id,
    qty: positiveInteger(input.qty, "จำนวนเบิก"),
    costSatang: money(input.costSatang, "ต้นทุนที่เบิก"),
    reason: String(input.reason || "อื่น ๆ"),
    note: String(input.note || ""),
    date: input.date,
    createdAt: input.at,
    updatedAt: input.at,
    revision: 1,
    ...catalogMeta(input)
  };
}

export const INVENTORY_OPERATIONS = Object.freeze({ buildPurchaseEffects, buildWithdrawalRecord });
