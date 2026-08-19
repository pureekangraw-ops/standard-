export const NORMALPOCKET_AUTHORITY = Object.freeze({
  STORE: "STORE",
  FINANCE: "FINANCE",
  CALENDAR: "CALENDAR",
  SHELL: "SHELL",
  SECURITY: "SECURITY",
  PERSISTENCE: "PERSISTENCE"
});

export function assertOwner(command, owner) {
  if (!command || command.owner !== owner) {
    const actual = command?.owner ?? "UNKNOWN";
    throw new Error(`${owner} authority rejected command owned by ${actual}`);
  }
  return command;
}
