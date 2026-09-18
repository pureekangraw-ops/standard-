import { DurableObject } from "cloudflare:workers";
import { createFactoryStatePort } from "./go-hub-factory-state-core.mjs";

export class GoHubFactoryState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.port = createFactoryStatePort({ storage: ctx.storage });
  }

  async load() {
    return this.port.load();
  }

  async save(input) {
    return this.port.save(input);
  }
}
