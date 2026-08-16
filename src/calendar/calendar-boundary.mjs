import { assertOwner } from "../architecture/authority.mjs";

export function createCalendarBoundary() {
  return Object.freeze({
    schedule({ owner, command, dueDate, context = null }) {
      if (!owner || !command || !dueDate) throw new Error("CALENDAR requires owner, command and dueDate");
      return Object.freeze({ owner, command, dueDate, context });
    },
    accept(command) {
      return assertOwner(command, "CALENDAR");
    }
  });
}
