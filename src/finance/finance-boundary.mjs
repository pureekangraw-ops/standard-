import { assertOwner } from "../architecture/authority.mjs";

export function createFinanceBoundary() {
  return Object.freeze({
    accept(command) {
      return assertOwner(command, "FINANCE");
    }
  });
}
