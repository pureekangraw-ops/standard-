export const FINANCE_COMMANDS = Object.freeze([
  'LEDGER_OBLIGATION_ADD',
  'TRANSACTION_REVERSE',
]);

export function applyFinanceCommand(state, command, ctx) {
  const { now, idFactory, newRecord, addTransaction, findById, isValidISODate, parseSatang } = ctx;
  const payload = command.payload || {};

  switch (command.type) {
    case 'LEDGER_OBLIGATION_ADD': {
      const amountSatang = parseSatang(payload.amountSatang, { allowZero: false, label: 'ยอดค้างชำระ' });
      if (!isValidISODate(payload.due)) throw new Error('วันครบกำหนดไม่ถูกต้อง');
      const obligation = {
        ...newRecord('OBL', now, idFactory),
        name: String(payload.name || 'ยอดค้างชำระ').trim(),
        originalSatang: amountSatang,
        paidSatang: 0,
        remainingSatang: amountSatang,
        firstDue: payload.due,
        status: 'OPEN',
      };
      state.ledger.obligations.push(obligation);
      state.calendar.push({
        ...newRecord('CAL', now, idFactory),
        owner: 'LEDGER',
        source: 'LEDGER',
        sourceId: obligation.id,
        actionType: 'PAY_OBLIGATION',
        title: `ชำระ ${obligation.name}`,
        amountSatang,
        due: payload.due,
        status: 'OPEN',
        appliedActions: {},
      });
      return true;
    }

    case 'TRANSACTION_REVERSE': {
      const original = findById(state.ledger.transactions, payload.id, 'ธุรกรรม');
      if (original.reversedBy) throw new Error('ธุรกรรมนี้ถูกกลับรายการแล้ว');
      const reversal = addTransaction(state, {
        direction: original.direction === 'IN' ? 'OUT' : 'IN',
        amountSatang: original.amountSatang,
        label: `กลับรายการ: ${original.label}`,
        source: original.source,
        sourceId: original.sourceId,
        subtype: `REVERSAL_${original.subtype}`,
        actionKey: `reversal:${original.id}`,
      }, now, idFactory);
      reversal.reason = String(payload.reason || 'กลับรายการ');
      reversal.reversalOf = original.id;
      original.reversedBy = reversal.id;
      original.updatedAt = now;
      original.revision += 1;
      return true;
    }

    default:
      return false;
  }
}
