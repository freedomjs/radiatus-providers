var CachedBuffer = require('./models/cachedbuffer');
var SparkMD5 = require('./providers/lib/spark-md5.min');
var bufferConverter = require('./lib/buffer');

/**
 * Site Handler for Transport
 **/
function TransportSiteHandler(logger) {
  this.logger = logger;
  this.clients = {};      //Store active clients
  this.waitingOnBuffer = {};
}

/**
 * Add a new WebSocket client
 * Set the appropriate listeners on the WebSocket
 **/
TransportSiteHandler.prototype.addConnection = function(username, ws) {
  this.logger.trace('addConnection: enter');
  this.logger.debug('addConnection: for username=' + username);

  // Store new client
  this.clients[username] = ws;
  ws.on('message', this._onMessage.bind(this, username));
  ws.on('close', this._onClose.bind(this, username));
  ws.send(JSON.stringify({
    'cmd': 'ready',
    'userId': username,
  }));

  this.logger.trace('addConnection: exit');
};

/**
 * Handler for incoming message on a WebSocket connection
 **/
TransportSiteHandler.prototype._onMessage = function(username, msg, flags) {
  this.logger.trace('_onMessage: enter');
  this.logger.debug('_onMessage: message from '+username);
  
  // Reroute binary messages
  if (flags.binary) {
    this._handleBinary(username, msg);
    return;
  }

  try {
    this.logger.debug(msg);
    var req = JSON.parse(msg);
    if (req.cmd == 'send') {
      this._handleSend(username, req);
    } else if (req.cmd == 'receive') {
      this._handleReceive(username, req);
    } else {
      this.logger.warn('_onMessage: cannot process message');
    }
  } catch (e) {
    this.logger.error('_onMessage: Failed processing message');
    this.logger.error(e);
  }

  this.logger.trace('_onMessage: exit');
};

/**
 * Handle send
 */
TransportSiteHandler.prototype._handleSend = function(username, req) {
  this.logger.trace('_handleSend: enter');
  CachedBuffer.findOne(
    { key:req.hash }, 
    'key expires'
  ).exec().then(function(username, req, doc) {
    if (doc) {
      this.logger.debug('_handleSend: buffer already cached, telling client');
      req.needBufferFromClient = false;
      req.bufferSetDone = true;
    } else {
      this.logger.debug('_handleSend: requesting buffer from client');
      req.needBufferFromClient = true;
      req.bufferSetDone = false;
      this.waitingOnBuffer[username] = req;
    }
    this.clients[username].send(JSON.stringify(req));
  }.bind(this, username, req)).onReject(this._onError.bind(this, username, req));
};


/**
 * Handle binary objects from a WebSocket
 */
TransportSiteHandler.prototype._handleBinary = function(username, msg) {
  this.logger.trace('_handleBinary: enter');
  if (!this.waitingOnBuffer.hasOwnProperty(username)) {
    this.logger.warn('_handleBinary: no request found for ' + username);
    return;
  }
  // Hash the buffer myself (SparkMD5 only works with ArrayBuffers)
  var spark = new SparkMD5.ArrayBuffer();
  spark.append(bufferConverter.toArrayBuffer(msg));
  var hash = spark.end();
  this.logger.debug('_handleBinary: hash='+hash);

  var req = this.waitingOnBuffer[username];
  // Free this up for another buffer
  delete this.waitingOnBuffer[username];
  // Create a new record
  var newRecord = new CachedBuffer({
    key: hash,
    value: msg,
    created: new Date(),
    expires: new Date((new Date().getTime()) + config.get('database.transportTTL')),
    lastAccessed: new Date()
  });

  if (req.hash !== hash) {
    this.logger.error('_handleBinary: expecting buffer with hash '+req.value);
    this.logger.error('_handleBinary: got buffer with hash '+hash);
    this._onError(username, req, new Error('received wrong buffer'));
    return;
  }

  // Save the buffer
  newRecord.save(function(username, req, err) {
    if (err) { 
      this._onError(username, req, err);
      return;
    }
    this.logger.debug('_handleBinary: buffer saved sending final message to client');
    req.needBufferFromClient = false;
    req.bufferSetDone = true;
    this.clients[username].send(JSON.stringify(req));
  }.bind(this, username, req));
  this.logger.trace('_handleBinary: exit');

};

/**
 * Handle receive
 */
TransportSiteHandler.prototype._handleReceive = function(username, req) {
  this.logger.trace('_handleReceive: enter'); 
  CachedBuffer.findOneAndUpdate(
    { key:req.hash },
    {
      expires: new Date((new Date().getTime()) + config.get('database.transportTTL')),
      lastAccessed: new Date()
    }
  ).exec().then(function (username, req, doc) {
    if (doc) {
      this.clients[username].send(doc.value, { binary:true });
      req.bufferSent = true;
      this.clients[username].send(JSON.stringify(req));
    } else {
      this.logger.warn('_handleReceive: content missing for hash='+req.hash);
      this.onError.bind(this, username, req)(new Error('data missing'));
    }
  }.bind(this, username, req)).onReject(this._onError.bind(this, username, req));
};

/**
 * Handler for when promises from mongoose calls are rejected
 **/
TransportSiteHandler.prototype._onError = function(username, req, err) {
  this.logger.error('_onError: mongoose error');
  this.logger.error(err);
  this.logger.error(err.message);
  req.err = "UNKNOWN";
  this.clients[username].send(JSON.stringify(req));
};

/**
 * Handler for 'close' event from a WebSocket
 **/
TransportSiteHandler.prototype._onClose = function(username) {
  this.logger.trace('_onClose: enter');
  this.logger.debug('_onClose: '+username+' closed connection');
  delete this.clients[username];
  this.logger.trace('_onClose: exit');
};

module.exports = TransportSiteHandler;
