function integer(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${label}ไม่ถูกต้อง`);
  return n;
}

export function shippingNetEffect(receivedSatang, shippingCostSatang) {
  return integer(receivedSatang, "เงินรับ") - integer(shippingCostSatang, "ค่าจัดส่ง");
}

export function buildSaleEffects(input) {
  const qty = integer(input.qty, "จำนวนขาย");
  if (qty < 1) throw new Error("จำนวนขายต้องมากกว่า 0");
  const unitPriceSatang = integer(input.unitPriceSatang, "ราคาต่อชิ้น");
  const receivedSatang = integer(input.receivedSatang, "เงินรับ");
  const shippingCostSatang = integer(input.shippingCostSatang || 0, "ค่าจัดส่ง");
  const costSatang = integer(input.costSatang || 0, "ต้นทุน");
  const totalSatang = qty * unitPriceSatang;
  if (!Number.isSafeInteger(totalSatang)) throw new Error("ยอดขายเกินขอบเขตที่รองรับ");
  if (receivedSatang > totalSatang) throw new Error("เงินรับมากกว่ายอดขาย");
  const outstandingSatang = totalSatang - receivedSatang;
  const status = receivedSatang === totalSatang ? "COMPLETED" : receivedSatang > 0 ? "PARTIAL" : "OPEN";
  const sale = {
    id: input.id,
    customer: String(input.customer || (outstandingSatang ? "ลูกค้าไม่ระบุชื่อ" : "ขายเงินสด")),
    contact: String(input.contact || ""),
    qty,
    unitPriceSatang,
    totalSatang,
    receivedSatang,
    outstandingSatang,
    costSatang,
    shippingCostSatang,
    netCashEffectSatang: shippingNetEffect(receivedSatang, shippingCostSatang),
    status,
    note: String(input.note || ""),
    date: input.date,
    createdAt: input.at,
    updatedAt: input.at,
    revision: 1,
    cancelledAt: null,
    stockRestored: false,
    productId: input.productId || null,
    variantId: input.variantId || null,
    optionSnapshot: input.optionSnapshot ? structuredClone(input.optionSnapshot) : {},
    productName: String(input.productName || "")
  };
  const transactions = [];
  if (receivedSatang > 0) transactions.push({ owner: "FINANCE", direction: "IN", amountSatang: receivedSatang, subtype: "SALE_INITIAL_RECEIPT", actionKey: `${input.id}:initial` });
  if (shippingCostSatang > 0) transactions.push({ owner: "FINANCE", direction: "OUT", amountSatang: shippingCostSatang, subtype: "SALE_SHIPPING_COST", actionKey: `${input.id}:shipping-cost` });
  const calendarEffects = outstandingSatang > 0 ? [{
    owner: "CALENDAR",
    type: "CREATE_RECEIVABLE_QUEUE",
    source: "STORE",
    sourceId: input.id,
    actionType: "RECEIVE_CUSTOMER_PAYMENT",
    status,
    amountSatang: outstandingSatang,
    due: input.due
  }] : [];
  return { sale, transactions, calendarEffects };
}
