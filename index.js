#!/usr/bin/env node
var config = require("config");
var app = require("./src/app");
var logger = require("./src/lib/logger")("index.js");

var port = config.get("webserver.port");

app.listen(port, function() {
  "use strict";
  logger.info("Radiatus Providers Server listening on port " + port);
});
