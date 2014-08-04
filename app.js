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

/** APPLICATION **/
var app = express();
var server = http.createServer(app);
var wss = new WebSocketServer({server: server});
var siteHandlers = {};

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


app.get('/', function(req, res) {
  res.send('Hello world');
});

wss.on('connection', function(ws) {
  console.log('opened connection');
  console.log(ws.upgradeReq.headers);

  var origin = ws.upgradeReq.headers.origin;
  if () {

  }

  ws.on('message', function(msg) {
    console.log('!!!');
    console.log('received: %s', msg);
  });
  ws.on('close', function() {
    console.log('closed connection');
  });
});

/**
io.on('connection', function(socket){
  console.log('a user connected');
});
**/

server.listen(opts.port, function() {
  console.log("Radiatus Providers Server listening on port " + opts.port);
});
