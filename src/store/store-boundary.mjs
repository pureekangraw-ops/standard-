import { assertOwner } from "../architecture/authority.mjs";

export function createStoreBoundary() {
  return Object.freeze({
    accept(command) {
      return assertOwner(command, "STORE");
    }
  });
}
