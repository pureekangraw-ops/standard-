export const CALENDAR_COMMANDS = Object.freeze([
  'CALENDAR_COMPLETE',
  'CALENDAR_CANCEL',
]);

export function applyCalendarCommand(state, command, ctx) {
  const { now, idFactory, addTransaction, findById } = ctx;
  const payload = command.payload || {};

  switch (command.type) {
    case 'CALENDAR_COMPLETE': {
      const item = findById(state.calendar, payload.id, 'รายการปฏิทิน');
      if (['COMPLETED', 'CANCELLED'].includes(item.status)) throw new Error('รายการนี้ทำรายการแล้ว');

      if (item.actionType === 'CONFIRM_STORE_RECEIPT') {
        const sale = findById(state.store.sales, item.sourceId, 'รายการขาย');
        if (sale.status !== 'RECEIVABLE') throw new Error('รายการขายทำรายการแล้ว');
        sale.status = 'SETTLED';
        sale.updatedAt = now;
        sale.revision += 1;
        addTransaction(state, {
          direction: 'IN',
          amountSatang: sale.totalSatang,
          label: `รับเงินยอดขาย ${sale.name}`,
          source: 'STORE',
          sourceId: sale.id,
          subtype: 'SALE_RECEIPT',
          actionKey: `store:credit-receipt:${sale.id}`,
        }, now, idFactory);
      } else if (item.actionType === 'PAY_OBLIGATION') {
        const obligation = findById(state.ledger.obligations, item.sourceId, 'ยอดค้างชำระ');
        if (obligation.status !== 'OPEN') throw new Error('ยอดค้างชำระทำรายการแล้ว');
        obligation.paidSatang = obligation.originalSatang;
        obligation.remainingSatang = 0;
        obligation.status = 'PAID';
        obligation.updatedAt = now;
        obligation.revision += 1;
        addTransaction(state, {
          direction: 'OUT',
          amountSatang: obligation.originalSatang,
          label: `ชำระ ${obligation.name}`,
          source: 'LEDGER',
          sourceId: obligation.id,
          subtype: 'OBLIGATION_PAYMENT',
          actionKey: `ledger:obligation:${obligation.id}`,
        }, now, idFactory);
      }

      item.status = 'COMPLETED';
      item.completedAt = now;
      item.updatedAt = now;
      item.revision += 1;
      return true;
    }

    case 'CALENDAR_CANCEL': {
      const item = findById(state.calendar, payload.id, 'รายการปฏิทิน');
      if (['COMPLETED', 'CANCELLED'].includes(item.status)) throw new Error('รายการนี้ทำรายการแล้ว');
      item.status = 'CANCELLED';
      item.cancelledAt = now;
      item.updatedAt = now;
      item.revision += 1;
      return true;
    }

    default:
      return false;
  }
}
