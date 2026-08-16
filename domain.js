import {
  createId,
  dateKey,
  isValidISODate,
  parseQuantity,
  parseSatang,
  validateState,
} from './core.js';
import { applyStoreCommand } from './src/domains/store-owner.mjs';

function clone(value) { return structuredClone(value); }
function findById(items, id, label) {
  const item = items.find(entry => entry.id === id);
  if (!item) throw new Error(`ไม่พบ${label}`);
  return item;
}
function newRecord(prefix, now, idFactory) {
  return { id: idFactory(prefix), createdAt: now, updatedAt: now, revision: 1 };
}
function addAudit(state, event, note, now, idFactory) {
  state.audit.push({ id: idFactory('AUD'), at: now, event, note });
}
function addTransaction(state, input, now, idFactory) {
  parseSatang(input.amountSatang, { allowZero: false, label: 'ยอดธุรกรรม' });
  if (!['IN', 'OUT'].includes(input.direction)) throw new Error('ทิศทางธุรกรรมไม่ถูกต้อง');
  if (state.ledger.transactions.some(tx => tx.actionKey === input.actionKey)) throw new Error(`actionKey ซ้ำ ${input.actionKey}`);
  const tx = {
    ...newRecord('TX', now, idFactory), direction: input.direction, amountSatang: input.amountSatang,
    label: input.label, source: input.source, sourceId: input.sourceId, subtype: input.subtype,
    actionKey: input.actionKey, status: 'ACTIVE', reversedBy: null,
  };
  state.ledger.transactions.push(tx);
  return tx;
}
function finish(state, type, now, idFactory) {
  state.revision = Number(state.revision || 0) + 1;
  state.updatedAt = now;
  addAudit(state, type, `คำสั่ง ${type}`, now, idFactory);
  const result = validateState(state);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return state;
}

export function applyCommand(sourceState, command, { now = new Date().toISOString(), idFactory = createId } = {}) {
  if (!command?.type) throw new Error('ไม่มีชนิดคำสั่ง');
  const payload = command.payload || {};
  const state = clone(sourceState);

  const handledByStore = applyStoreCommand(state, command, {
    now, idFactory, newRecord, addTransaction, dateKey, isValidISODate, parseQuantity, parseSatang,
  });
  if (handledByStore) return finish(state, command.type, now, idFactory);

  switch (command.type) {
    case 'LEDGER_OBLIGATION_ADD': {
      const amountSatang = parseSatang(payload.amountSatang, { allowZero: false, label: 'ยอดค้างชำระ' });
      if (!isValidISODate(payload.due)) throw new Error('วันครบกำหนดไม่ถูกต้อง');
      const obligation = {
        ...newRecord('OBL', now, idFactory), name: String(payload.name || 'ยอดค้างชำระ').trim(),
        originalSatang: amountSatang, paidSatang: 0, remainingSatang: amountSatang,
        firstDue: payload.due, status: 'OPEN',
      };
      state.ledger.obligations.push(obligation);
      state.calendar.push({
        ...newRecord('CAL', now, idFactory), owner: 'LEDGER', source: 'LEDGER', sourceId: obligation.id,
        actionType: 'PAY_OBLIGATION', title: `ชำระ ${obligation.name}`, amountSatang,
        due: payload.due, status: 'OPEN', appliedActions: {},
      });
      break;
    }
    case 'CALENDAR_COMPLETE': {
      const item = findById(state.calendar, payload.id, 'รายการปฏิทิน');
      if (['COMPLETED', 'CANCELLED'].includes(item.status)) throw new Error('รายการนี้ทำรายการแล้ว');
      if (item.actionType === 'CONFIRM_STORE_RECEIPT') {
        const sale = findById(state.store.sales, item.sourceId, 'รายการขาย');
        if (sale.status !== 'RECEIVABLE') throw new Error('รายการขายทำรายการแล้ว');
        sale.status = 'SETTLED'; sale.updatedAt = now; sale.revision += 1;
        addTransaction(state, {
          direction: 'IN', amountSatang: sale.totalSatang, label: `รับเงินยอดขาย ${sale.name}`,
          source: 'STORE', sourceId: sale.id, subtype: 'SALE_RECEIPT', actionKey: `store:credit-receipt:${sale.id}`,
        }, now, idFactory);
      } else if (item.actionType === 'PAY_OBLIGATION') {
        const obligation = findById(state.ledger.obligations, item.sourceId, 'ยอดค้างชำระ');
        if (obligation.status !== 'OPEN') throw new Error('ยอดค้างชำระทำรายการแล้ว');
        obligation.paidSatang = obligation.originalSatang; obligation.remainingSatang = 0;
        obligation.status = 'PAID'; obligation.updatedAt = now; obligation.revision += 1;
        addTransaction(state, {
          direction: 'OUT', amountSatang: obligation.originalSatang, label: `ชำระ ${obligation.name}`,
          source: 'LEDGER', sourceId: obligation.id, subtype: 'OBLIGATION_PAYMENT',
          actionKey: `ledger:obligation:${obligation.id}`,
        }, now, idFactory);
      }
      item.status = 'COMPLETED'; item.completedAt = now; item.updatedAt = now; item.revision += 1;
      break;
    }
    case 'CALENDAR_CANCEL': {
      const item = findById(state.calendar, payload.id, 'รายการปฏิทิน');
      if (['COMPLETED', 'CANCELLED'].includes(item.status)) throw new Error('รายการนี้ทำรายการแล้ว');
      item.status = 'CANCELLED'; item.cancelledAt = now; item.updatedAt = now; item.revision += 1;
      break;
    }
    case 'TRANSACTION_REVERSE': {
      const original = findById(state.ledger.transactions, payload.id, 'ธุรกรรม');
      if (original.reversedBy) throw new Error('ธุรกรรมนี้ถูกกลับรายการแล้ว');
      const reversal = addTransaction(state, {
        direction: original.direction === 'IN' ? 'OUT' : 'IN', amountSatang: original.amountSatang,
        label: `กลับรายการ: ${original.label}`, source: original.source, sourceId: original.sourceId,
        subtype: `REVERSAL_${original.subtype}`, actionKey: `reversal:${original.id}`,
      }, now, idFactory);
      reversal.reason = String(payload.reason || 'กลับรายการ'); reversal.reversalOf = original.id;
      original.reversedBy = reversal.id; original.updatedAt = now; original.revision += 1;
      break;
    }
    default: throw new Error(`ไม่รองรับคำสั่ง ${command.type}`);
  }
  return finish(state, command.type, now, idFactory);
}
