/** 
 * Radiatus Providers Server
 **/

var path = require('path');
var express = require('express');
var http = require('http');
var morgan  = require('morgan');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var charlatan = require('charlatan');
var WebSocketServer = require('ws').Server;
var GlobalSiteHandler = require('./src/sitehandler-global');

/** APPLICATION **/
var app = express();
var server = http.createServer(app);
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


wss.on('connection', function(ws) {
  //console.log(ws.upgradeReq.headers.origin);
  //console.log(ws.upgradeReq.url);

  var origin = ws.upgradeReq.headers.origin;
  var url = ws.upgradeReq.url;
  var appid = origin + url;
  if (!siteHandlers.hasOwnProperty(appid)) {
    siteHandlers[appid] = new GlobalSiteHandler();
  }
  siteHandlers[appid].addConnection(charlatan.Name.name(), ws);
});

app.get('*', function(req, res) {
  res.status = 404;
  res.send('404 - Not Found');
});

server.listen(opts.port, function() {
  console.log("Radiatus Providers Server listening on port " + opts.port);
});
