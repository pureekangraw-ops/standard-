import { assertOwner } from "../architecture/authority.mjs";
import { INSTALLMENT_SCHEDULE } from "./installment-schedule.mjs";
import { INSTALLMENT_OPERATIONS } from "./installment-operations.mjs";

export function createFinanceBoundary() {
  return Object.freeze({
    schedule: INSTALLMENT_SCHEDULE,
    installments: INSTALLMENT_OPERATIONS,
    accept(command) {
      return assertOwner(command, "FINANCE");
    }
  });
}
