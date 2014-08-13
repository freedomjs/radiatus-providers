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
  this.logger.trace('addConnection: enter');
  this.logger.debug('addConnection: for username=' + username);

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

  this.logger.trace('addConnection: exit');
};

/**
 * Handler for incoming message on a WebSocket connection
 **/
TransportSiteHandler.prototype._onMessage = function(connHandler, msg, flags) {
  this.logger.trace('_onMessage: enter');
  this.logger.debug('_onMessage: message from '+connHandler.username);
  
  // Reroute binary messages
  if (flags.binary) {
    connHandler.handleBinary(msg, true);
    return;
  }
  
  // Process commands
  try {
    this.logger.debug(msg);
    var req = JSON.parse(msg);
    if (req.cmd == 'send') {
      this._handleSend(connHandler, req);
    } else if (req.cmd == 'receive') {
      this._handleReceive(connHandler, req);
    } else {
      this.logger.warn('_onMessage: cannot process message');
    }
  } catch (e) {
    this.logger.error('_onMessage: Failed processing message');
    this.logger.error(e.message);
  }

  this.logger.trace('_onMessage: exit');
};

/**
 * Handle send
 */
TransportSiteHandler.prototype._handleSend = function(connHandler, req) {
  this.logger.trace('_handleSend: enter');
  CachedBuffer.findOne(
    { key:req.hash }, 
    'key expires'
  ).exec().then(function(connHandler, req, doc) {
    if (doc) {
      this.logger.debug('_handleSend: buffer already cached, telling client');
      req.needBufferFromClient = false;
      req.bufferSetDone = true;
    } else {
      this.logger.debug('_handleSend: requesting buffer from client');
      req.needBufferFromClient = true;
      req.bufferSetDone = false;
      connHandler.binaryCallback(req.hash, function(connHandler, req, err) {
        if (err) { 
          this._onError(connHandler, req, err);
          return;
        }
        this.logger.debug('_handleBinary: buffer saved sending final message to client');
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
  this.logger.trace('_handleReceive: enter'); 
  CachedBuffer.findOneAndUpdate(
    { key:req.hash },
    {
      expires: new Date((new Date().getTime()) + config.get('database.transportTTL')),
      lastAccessed: new Date()
    }
  ).exec().then(function (connHandler, req, doc) {
    if (doc) {
      connHandler.websocket.send(doc.value, { binary:true });
      req.bufferSent = true;
      connHandler.websocket.send(JSON.stringify(req));
    } else {
      this.logger.warn('_handleReceive: content missing for hash='+req.hash);
      this.onError.bind(this, connHandler, req)(new Error('data missing'));
    }
  }.bind(this, connHandler, req)).onReject(this._onError.bind(this, connHandler, req));
};

/**
 * Handler for when promises from mongoose calls are rejected
 **/
TransportSiteHandler.prototype._onError = function(connHandler, req, err) {
  this.logger.error('_onError: mongoose error');
  this.logger.error(err);
  this.logger.error(err.message);
  req.err = "UNKNOWN";
  connHandler.websocket.send(JSON.stringify(req));
};

/**
 * Handler for 'close' event from a WebSocket
 **/
TransportSiteHandler.prototype._onClose = function(connHandler) {
  this.logger.trace('_onClose: enter');
  this.logger.debug('_onClose: '+connHandler.username+' closed connection');
  this.clients[connHandler.username] = this.clients[connHandler.username].filter(function(connHandler, elt) {
    return connHandler !== elt;
  }.bind(this, connHandler));
  //delete this.clients[username];
  this.logger.trace('_onClose: exit');
};

module.exports = TransportSiteHandler;
