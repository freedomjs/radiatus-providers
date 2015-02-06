var fdom;
if (typeof freedom === "undefined") {
  fdom = require("freedom-for-node").freedom;
} else {
  fdom = freedom;
}

describe("integration-single: social.radiatus.json",
  require("freedom/spec/providers/social/social.single.integration.src").bind(
    this, fdom, "dist/social.radiatus.json", {}));

describe("integration-double: social.radiatus.json",
  require("freedom/spec/providers/social/social.double.integration.src").bind(
    this, fdom, "dist/social.radiatus.json", {}));

/**
//@todo Pending rewrite of authentication mechanism
describe("integration: storage.radiatus.json",
  require("freedom/spec/providers/storage/storage.integration.src").bind(
    this, fdom, "dist/storage.radiatus.json", {}, false));

describe("integration: storebuffer.radiatus.json",
  require("freedom/spec/providers/storage/storage.integration.src").bind(
    this, fdom, "dist/storebuffer.radiatus.json", {}, true));
**/
/**
//@todo Transport test needs to be rewritten
describe(
  "integration: transport.radiatus.json", 
  INTEGRATIONTEST.transport.bind(this, "/src/providers/transport.radiatus.json")
);
**/
