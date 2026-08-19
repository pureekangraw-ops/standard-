export const STORE_COMMANDS = Object.freeze([
  'STORE_PURCHASE',
  'STORE_SALE',
  'STORE_WITHDRAW',
]);

export function applyStoreCommand(state, command, ctx) {
  const { now, idFactory, newRecord, addTransaction, dateKey, isValidISODate, parseQuantity, parseSatang } = ctx;
  const payload = command.payload || {};

  switch (command.type) {
    case 'STORE_PURCHASE': {
      const qty = parseQuantity(payload.qty, { label: 'จำนวนสินค้าเข้า' });
      const totalSatang = parseSatang(payload.totalSatang, { allowZero: false, label: 'ยอดซื้อสินค้า' });
      const purchase = {
        ...newRecord('BUY', now, idFactory),
        name: String(payload.name || 'สินค้าเข้า').trim(), qty, costSatang: totalSatang,
        paidAmountSatang: totalSatang, date: dateKey(now), status: 'ACTIVE',
      };
      state.store.purchases.push(purchase);
      state.store.stockQty += qty;
      state.store.stockValueSatang += totalSatang;
      addTransaction(state, {
        direction: 'OUT', amountSatang: totalSatang, label: `ซื้อสินค้า ${purchase.name}`,
        source: 'STORE', sourceId: purchase.id, subtype: 'PURCHASE_PAYMENT',
        actionKey: `store:purchase:${purchase.id}`,
      }, now, idFactory);
      return true;
    }
    case 'STORE_SALE': {
      const qty = parseQuantity(payload.qty, { label: 'จำนวนขาย' });
      const totalSatang = parseSatang(payload.totalSatang, { allowZero: false, label: 'ยอดขาย' });
      if (qty > state.store.stockQty) throw new Error('สินค้าในสต็อกไม่พอ');
      const paymentMode = payload.paymentMode === 'CREDIT' ? 'CREDIT' : 'CASH';
      const avgCost = state.store.stockQty > 0 ? state.store.stockValueSatang / state.store.stockQty : 0;
      const costReleasedSatang = Math.min(state.store.stockValueSatang, Math.round(avgCost * qty));
      const sale = {
        ...newRecord('SALE', now, idFactory), name: String(payload.name || 'ขายสินค้า').trim(),
        qty, totalSatang, paymentMode, costReleasedSatang, date: dateKey(now),
        status: paymentMode === 'CASH' ? 'SETTLED' : 'RECEIVABLE',
      };
      state.store.sales.push(sale);
      state.store.stockQty -= qty;
      state.store.stockValueSatang -= costReleasedSatang;
      if (state.store.stockQty === 0) state.store.stockValueSatang = 0;
      if (paymentMode === 'CASH') {
        addTransaction(state, {
          direction: 'IN', amountSatang: totalSatang, label: `ยอดขาย ${sale.name}`,
          source: 'STORE', sourceId: sale.id, subtype: 'SALE_RECEIPT',
          actionKey: `store:sale:${sale.id}`,
        }, now, idFactory);
      } else {
        state.calendar.push({
          ...newRecord('CAL', now, idFactory), owner: 'STORE', source: 'STORE', sourceId: sale.id,
          actionType: 'CONFIRM_STORE_RECEIPT', title: `ติดตามรับเงิน ${sale.name}`,
          amountSatang: totalSatang, due: isValidISODate(payload.due) ? payload.due : dateKey(now),
          status: 'OPEN', appliedActions: {},
        });
      }
      return true;
    }
    case 'STORE_WITHDRAW': {
      const qty = parseQuantity(payload.qty, { label: 'จำนวนเบิก' });
      if (qty > state.store.stockQty) throw new Error('สินค้าในสต็อกไม่พอ');
      const avgCost = state.store.stockQty > 0 ? state.store.stockValueSatang / state.store.stockQty : 0;
      const valueSatang = Math.min(state.store.stockValueSatang, Math.round(avgCost * qty));
      const withdrawal = {
        ...newRecord('WD', now, idFactory), qty, valueSatang,
        note: String(payload.note || 'เบิกสินค้า').trim(), date: dateKey(now), status: 'ACTIVE',
      };
      state.store.withdrawals.push(withdrawal);
      state.store.stockQty -= qty;
      state.store.stockValueSatang -= valueSatang;
      if (state.store.stockQty === 0) state.store.stockValueSatang = 0;
      return true;
    }
    default:
      return false;
  }
}
