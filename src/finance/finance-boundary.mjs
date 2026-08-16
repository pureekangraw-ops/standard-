import { assertOwner } from "../architecture/authority.mjs";
import { INSTALLMENT_SCHEDULE } from "./installment-schedule.mjs";

export function createFinanceBoundary() {
  return Object.freeze({
    schedule: INSTALLMENT_SCHEDULE,
    accept(command) {
      return assertOwner(command, "FINANCE");
    }
  });
}
