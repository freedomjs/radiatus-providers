/** 
 * Radiatus Providers Server
 **/

var path = require('path');
var urlParser = require('url');
var queryParser = require('querystring');
var express = require('express');
var http = require('http');
var morgan  = require('morgan');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var charlatan = require('charlatan');
var WebSocketServer = require('ws').Server;
var GlobalSocialSiteHandler = require('./src/sitehandler-social-global');

/** APPLICATION **/
var app = express();
var server = http.createServer(app);
var config = require('config');
var wss = new WebSocketServer({server: server});
var siteHandlers = {};
charlatan.setLocale('en-us');

/** OPTIONS PARSING **/
var opts = require('nomnom')
  .option('debug', {
    abbr: 'd',
    flag: true,
    help: 'Print debugging info'
  })
  .option('port', {
    abbr: 'p',
    help: 'listening port',
    metavar: 'PORT',
    default: 8082
  }).parse();

/** LOGGER **/
if (opts.debug) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('common'));
}

/** STATIC CONTENT **/
app.use(express.static(path.join(__dirname, 'src/providers')));

/** SESSIONS/COOKIES **/
/**
app.use(cookieParser(config.sessionSecret));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(methodOverride());
app.use(session({
  store: sessionStore,
  secret: config.sessionSecret,
  name: config.cookieKey,
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
**/

// Social API: every app has 2 separate global buddylists:
// - 1 for anonymous users
// - 1 for users with valid Radiatus accounts
wss.on('connection', function(ws) {
  //console.log(ws.upgradeReq.headers.origin);
  console.log(ws.upgradeReq.url);

  var origin = ws.upgradeReq.headers.origin;
  var url = ws.upgradeReq.url;
  var parsedUrl = urlParser.parse(url);
  var parsedQuery = queryParser.parse(parsedUrl.query);
  var username, appid;

  // Only expose storage/transport to a valid Radiatus runtime
  if (parsedQuery.hasOwnProperty('radiatusUsername') &&
      parsedQuery.hasOwnProperty('radiatusSecret') &&
      parsedQuery.radiatusSecret == config.get('server.radiatusSecret') &&
      parsedQuery.hasOwnProperty('freedomAPI') && 
      parsedQuery.freedomAPI == 'storage') {
    username = parsedQuery.radiatusUsername;
    appid = 'Storage-' + origin + parsedUrl.pathname;
    if (!siteHandlers.hasOwnProperty(appid)) {
      siteHandlers[appid] = new StorageSiteHandler();
    }
    siteHandlers[appid].addConnection(username, ws);
  } else if (parsedQuery.hasOwnProperty('radiatusUsername') &&
      parsedQuery.hasOwnProperty('radiatusSecret') &&
      parsedQuery.radiatusSecret == config.get('server.radiatusSecret') &&
      parsedQuery.hasOwnProperty('freedomAPI') && 
      parsedQuery.freedomAPI == 'transport') {
    username = parsedQuery.radiatusUsername;
    appid = 'Transport-' + origin + parsedUrl.pathname;
    //@todo
    console.error("TRANSPORT SITE HANDLER: NEED TO COMPLETE");
  } else if (parsedQuery.hasOwnProperty('radiatusUsername') &&
      parsedQuery.hasOwnProperty('radiatusSecret') &&
      parsedQuery.radiatusSecret == config.get('server.radiatusSecret') &&
      parsedQuery.hasOwnProperty('freedomAPI') && 
      parsedQuery.freedomAPI == 'social') {
    username = parsedQuery.radiatusUsername;
    appid = 'SocialAuth-' + origin + parsedUrl.pathname;
    if (!siteHandlers.hasOwnProperty(appid)) {
      siteHandlers[appid] = new GlobalSocialSiteHandler();
    }
    siteHandlers[appid].addConnection(username, ws);
  } else { //Default is anonymous social
    username = charlatan.Name.name();
    appid = 'SocialAnon-' + origin + parsedUrl.pathname;
    if (!siteHandlers.hasOwnProperty(appid)) {
      siteHandlers[appid] = new GlobalSocialSiteHandler();
    }
    siteHandlers[appid].addConnection(username, ws);
  }
  console.log(appid);
});

app.get('*', function(req, res) {
  res.status = 404;
  res.send('404 - Not Found');
});

server.listen(opts.port, function() {
  console.log("Radiatus Providers Server listening on port " + opts.port);
});
