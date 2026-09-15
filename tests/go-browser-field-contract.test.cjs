"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-browser-field-contract.js")).href;

async function loadContract(tag) {
  return import(`${moduleUrl}?${tag}=${Date.now()}`);
}

test("shared semantics preserve V0 classifications", async () => {
  const contract = await loadContract("semantic");
  assert.equal(contract.semanticRoleForName("Product name"), "title");
  assert.equal(contract.semanticRoleForName("Description"), "description");
  assert.equal(contract.semanticRoleForName("Price"), "price");
  assert.equal(contract.semanticRoleForName("OTP code"), "otp");
  assert.equal(contract.semanticRoleForName("Card number"), "payment");
  assert.equal(contract.semanticRoleForName("Whatever this is"), "unknown");
  assert.equal(contract.readRiskClassForSemanticRole("title"), "SAFE_READ");
  assert.equal(contract.readRiskClassForSemanticRole("otp"), "SENSITIVE");
  assert.equal(contract.readRiskClassForSemanticRole("unknown"), "UNKNOWN");
});

test("shared value-kind mapping preserves V0", async () => {
  const contract = await loadContract("kind");
  assert.equal(contract.valueKindForRole("spinbutton"), "number");
  assert.equal(contract.valueKindForRole("checkbox"), "boolean");
  assert.equal(contract.valueKindForRole("combobox"), "choice");
  assert.equal(contract.valueKindForRole("textbox"), "text");
});
