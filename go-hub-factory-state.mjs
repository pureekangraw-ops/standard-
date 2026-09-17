import { createFactoryStatePort } from "./go-hub-factory-state-core.mjs";

export class GoHubFactoryState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.port = createFactoryStatePort({ storage: ctx.storage });
  }

  async load() {
    return this.port.load();
  }

  async save(input) {
    return this.port.save(input);
  }
}
