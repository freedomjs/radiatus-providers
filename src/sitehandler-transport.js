var CachedBuffer = require('./models/cachedbuffer');
var ConnectionHandler = require('./connectionhandler');
var getLogger = require('./lib/logger');
var config = require('config');

/**
 * Site Handler for Transport
 **/
function TransportSiteHandler(appid) {
  this.appid = appid;
  this.logger = getLogger(appid);
  this.clients = {};      //Store active clients
}

/**
 * Add a new WebSocket client
 * Set the appropriate listeners on the WebSocket
 **/
TransportSiteHandler.prototype.addConnection = function(username, ws) {
  this.logger.debug(username+'.addConnection: enter');

  // Store new client
  if (!this.clients.hasOwnProperty(username)) { 
    this.clients[username] = [];
  }
  var connHandler = new ConnectionHandler(this.appid, username, ws);
  this.clients[username].push(connHandler);
  
  ws.on('message', this._onMessage.bind(this, connHandler));
  ws.on('close', this._onClose.bind(this, connHandler));
  ws.send(JSON.stringify({
    'cmd': 'ready',
    'userId': username,
  }));

  this.logger.trace(username+'.addConnection: exit');
};

/**
 * Handler for incoming message on a WebSocket connection
 **/
TransportSiteHandler.prototype._onMessage = function(connHandler, msg, flags) {
  this.logger.trace(connHandler.id()+'._onMessage: enter');
  
  // Reroute binary messages
  if (flags.binary) {
    connHandler.handleBinary(msg, true);
    return;
  }
  
  // Process commands
  try {
    this.logger.debug(connHandler.id()+'._onMessage:'+msg);
    var req = JSON.parse(msg);
    if (req.cmd == 'send') {
      this._handleSend(connHandler, req);
    } else if (req.cmd == 'receive') {
      this._handleReceive(connHandler, req);
    } else {
      this.logger.warn(connHandler.id()+'._onMessage: cannot process message');
    }
  } catch (e) {
    this.logger.error(connHandler.id()+'._onMessage: Failed processing message, '+e.message);
    //this.logger.error(e.message);
  }

  this.logger.trace(connHandler.id()+'._onMessage: exit');
};

/**
 * Handle send
 */
TransportSiteHandler.prototype._handleSend = function(connHandler, req) {
  this.logger.trace(connHandler.id()+'._handleSend: enter');
  CachedBuffer.findOne(
    { key:req.hash }, 
    'key expires'
  ).exec().then(function(connHandler, req, doc) {
    if (doc) {
      this.logger.debug(connHandler.id()+'._handleSend: buffer already cached, telling client');
      req.needBufferFromClient = false;
      req.bufferSetDone = true;
    } else {
      this.logger.debug(connHandler.id()+'._handleSend: requesting buffer from client');
      req.needBufferFromClient = true;
      req.bufferSetDone = false;
      connHandler.binaryCallback(req.hash, function(connHandler, req, err) {
        if (err) { 
          this._onError(connHandler, req, err);
          return;
        }
        this.logger.debug(connHandler.id()+'._handleBinary: buffer saved sending final message to client');
        req.needBufferFromClient = false;
        req.bufferSetDone = true;
        connHandler.websocket.send(JSON.stringify(req));
      }.bind(this, connHandler, req));
    }
    connHandler.websocket.send(JSON.stringify(req));
  }.bind(this, connHandler, req)).onReject(this._onError.bind(this, connHandler, req));
};

/**
 * Handle receive
 */
TransportSiteHandler.prototype._handleReceive = function(connHandler, req) {
  this.logger.trace(connHandler.id()+'._handleReceive: enter'); 
  CachedBuffer.findOneAndUpdate(
    { key:req.hash },
    {
      expires: new Date((new Date().getTime()) + config.get('database.transportTTL')),
      lastAccessed: new Date()
    }
  ).exec().then(function (connHandler, req, doc) {
    if (doc) {
      this.logger.debug(connHandler.id()+'._handleReceive: serving buffer to client hash='+req.hash);
      connHandler.websocket.send(doc.value, { binary:true });
      req.bufferSent = true;
      connHandler.websocket.send(JSON.stringify(req));
    } else {
      this.logger.warn(connHandler.id()+'._handleReceive: content missing for hash='+req.hash);
      this.onError.bind(this, connHandler, req)(new Error('data missing'));
    }
  }.bind(this, connHandler, req)).onReject(this._onError.bind(this, connHandler, req));
};

/**
 * Handler for when promises from mongoose calls are rejected
 **/
TransportSiteHandler.prototype._onError = function(connHandler, req, err) {
  this.logger.error(connHandler.id()+'._onError: mongoose error: '+err.message);
  //this.logger.error(err);
  req.err = "UNKNOWN";
  connHandler.websocket.send(JSON.stringify(req));
};

/**
 * Handler for 'close' event from a WebSocket
 **/
TransportSiteHandler.prototype._onClose = function(connHandler) {
  this.logger.debug(connHandler.id()+'._onClose: closed connection');
  this.clients[connHandler.username] = this.clients[connHandler.username].filter(function(connHandler, elt) {
    return connHandler !== elt;
  }.bind(this, connHandler));
  //delete this.clients[username];
  this.logger.trace(connHandler.id()+'._onClose: exit');
};

module.exports = TransportSiteHandler;
