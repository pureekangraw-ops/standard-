import {
  createId,
  dateKey,
  isValidISODate,
  parseQuantity,
  parseSatang,
  validateState,
} from './core.js';
import { applyStoreCommand } from './src/domains/store-owner.mjs';
import { applyFinanceCommand } from './src/domains/finance-owner.mjs';
import { applyCalendarCommand } from './src/domains/calendar-owner.mjs';

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
    ...newRecord('TX', now, idFactory),
    direction: input.direction,
    amountSatang: input.amountSatang,
    label: input.label,
    source: input.source,
    sourceId: input.sourceId,
    subtype: input.subtype,
    actionKey: input.actionKey,
    status: 'ACTIVE',
    reversedBy: null,
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
  const state = clone(sourceState);
  const shared = {
    now,
    idFactory,
    newRecord,
    addTransaction,
    findById,
    dateKey,
    isValidISODate,
    parseQuantity,
    parseSatang,
  };

  const handled =
    applyStoreCommand(state, command, shared) ||
    applyFinanceCommand(state, command, shared) ||
    applyCalendarCommand(state, command, shared);

  if (!handled) throw new Error(`ไม่รองรับคำสั่ง ${command.type}`);
  return finish(state, command.type, now, idFactory);
}
