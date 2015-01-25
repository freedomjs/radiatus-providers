var config = require("config");
var app = require("./src/app");
var logger = require("./src/lib/logger")("index.js");

var port = config.get("webserver.port");

app.listen(port, function() {
  logger.info("Radiatus Providers Server listening on port " + port);
});
