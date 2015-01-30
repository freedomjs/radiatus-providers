/** 
 * Radiatus Providers Server
 **/
var config = require('config');
var path = require('path');
var urlParser = require('url');
var queryParser = require('querystring');
var express = require('express');
var http = require('http');
var morgan  = require('morgan');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var charlatan = require('charlatan');
var mongoose = require('mongoose');

var WebSocketServer = require('ws').Server;
var GlobalSocialSiteHandler = require('./core/sitehandler-social-global');
var StorageSiteHandler = require('./core/sitehandler-storage');
var TransportSiteHandler = require('./core/sitehandler-transport');
var logger = require('./lib/logger')("app.js");

/** APPLICATION **/
var app = express();
var server = http.createServer(app);
var wss = new WebSocketServer({ server: server });
var siteHandlers = {};
charlatan.setLocale('en-us');
mongoose.connection.on('error', function(e) {
  "use strict";
  logger.error('Mongoose error');
  logger.error(e);
});
mongoose.connection.once('open', function() {
  "use strict";
  logger.info('Mongoose connection online established to ' + config.get('database.mongoURL'));
});

/** OPTIONS PARSING **/
var opts = require('nomnom').option('debug', {
  abbr: 'd',
  flag: true,
  help: 'Print debugging info'
}).parse();

/** LOGGER **/
if (opts.debug) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('common'));
}

/** STATIC CONTENT **/
app.use(express.static(path.join(__dirname, 'src/providers')));

/** WebSocket Router **/
// Given a HTTP request, check if allowed for an API
function isAllowed(api, req) {
  "use strict";
  var parsedUrl = urlParser.parse(req.url);
  var parsedQuery = queryParser.parse(parsedUrl.query);
  
  return parsedQuery.hasOwnProperty('radiatusUsername') &&
    parsedQuery.hasOwnProperty('radiatusSecret') &&
    parsedQuery.radiatusSecret === config.get('webserver.radiatusSecret') &&
    parsedQuery.hasOwnProperty('freedomAPI') && 
    parsedQuery.freedomAPI === api;
}
wss.on('connection', function(ws) {
  "use strict";
  logger.trace('wss.on("connection"): enter');
  var origin = ws.upgradeReq.headers.origin;
  var url = ws.upgradeReq.url;
  var parsedUrl = urlParser.parse(url);
  var parsedQuery = queryParser.parse(parsedUrl.query);
  var username, appid;

  // Check which sitehandler to route to
  // Storage Site Handler
  if (isAllowed('storage', ws.upgradeReq)) {
    username = parsedQuery.radiatusUsername;
    appid = 'Storage-' + origin + parsedUrl.pathname;
    if (!siteHandlers.hasOwnProperty(appid)) {
      siteHandlers[appid] = new StorageSiteHandler(appid);
    }
  // Transport Site Handler
  } else if (isAllowed('transport', ws.upgradeReq)) {
    username = parsedQuery.radiatusUsername;
    appid = 'Transport-' + origin + parsedUrl.pathname;
    if (!siteHandlers.hasOwnProperty(appid)) {
      siteHandlers[appid] = new TransportSiteHandler(appid);
    }
  // Social Site Handler: 
  // every app has 2 separate global buddylists:
  // - 1 for anonymous users
  // - 1 for users with valid Radiatus accounts
  } else if (isAllowed('social', ws.upgradeReq)) {
    username = parsedQuery.radiatusUsername;
    appid = 'SocialAuth-' + origin + parsedUrl.pathname;
    if (!siteHandlers.hasOwnProperty(appid)) {
      siteHandlers[appid] = new GlobalSocialSiteHandler(appid);
    }
  } else { //Default is anonymous social
    username = charlatan.Name.name();
    appid = 'SocialAnon-' + origin + parsedUrl.pathname;
    if (!siteHandlers.hasOwnProperty(appid)) {
      siteHandlers[appid] = new GlobalSocialSiteHandler(appid);
    }
  }
  logger.debug('wss.on("connection"): url = ' + ws.upgradeReq.url);
  logger.debug('wss.on("connection"): appid = ' + appid);
  logger.debug('wss.on("connection"): username = ' + username);
  siteHandlers[appid].addConnection(username, ws);
  logger.trace('wss.on("connection"): exit');
});

app.get('*', function(req, res) {
  "use strict";
  logger.trace('app.get("*"): enter');
  res.status = 404;
  res.send('404 - Not Found');
  logger.trace('app.get("*"): exit');
});

module.exports.start = function() {
  "use strict";
  var port = config.get("webserver.port");
  mongoose.connect(config.get('database.mongoURL'));
  server.listen(port, function() {
    logger.info("Radiatus Providers Server listening on port " + port);
  });
};
module.exports.stop = function() {
  "use strict";
  mongoose.disconnect();
  server.close();
};
