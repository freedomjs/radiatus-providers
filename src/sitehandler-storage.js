var Storage = require('./models/storage');
var CachedBuffer = require('./models/cachedbuffer');
var SparkMD5 = require('./providers/lib/spark-md5.min');
/**
 * Site Handler for Storage
 * - supports requests from the storage and storebuffer
 *   APIs, so must make check to see if binaries are on the line
 **/
function StorageSiteHandler(logger) {
  this.logger = logger;
  this.clients = {};      //Store active clients
  // username -> req for calls to set waiting
  // on buffer from the client
  this.waitingOnBuffer = {};
  
}

/**
 * Add a new WebSocket client
 * Set the appropriate listeners on the WebSocket
 **/
StorageSiteHandler.prototype.addConnection = function(username, ws) {
  this.logger.trace('addConnection: enter');
  this.logger.debug('addConnection: for username=' + username);

  // Store new client
  this.clients[username] = ws;
  ws.on('message', this._onMessage.bind(this, username));
  ws.on('close', this._onClose.bind(this, username));
  // Send back a ready signal
  ws.send(JSON.stringify({
    'method': 'ready',
    'userId': username,
  }));

  this.logger.trace('addConnection: exit');
};

/**
 * Handler for incoming message on a WebSocket connection
 **/
StorageSiteHandler.prototype._onMessage = function(username, msg, flags) {
  this.logger.trace('_onMessage: enter');
  this.logger.debug('_onMessage: message from '+username);
  if (flags.binary) {
    this._handleBinary(username, msg);
    return;
  }
  try {
    console.log(msg);
    var parsedMsg = JSON.parse(msg);
    if (parsedMsg.hasOwnProperty('method') &&
        this[parsedMsg.method]) {
      this[parsedMsg.method].bind(this)(username, parsedMsg);
    } else {
      this.logger.warn('_onMessage: invalid request ' + msg);  
    }
  } catch (e) {
    this.logger.error('_onMessage: failed processing message');
    this.logger.error(e.message);
    this.logger.error(e.stack);
  }

  this.logger.trace('_onMessage: exit');
};


StorageSiteHandler.prototype._handleBinary = function(username, msg) {
  this.logger.trace('_handleBinary: enter');
  if (!this.waitingOnBuffer.hasOwnProperty(username)) {
    console.error('StorageSiteHandler._handleBinary: no request found for ' + username);
    return;
  }
  // Hash the buffer myself (SparkMD5 only works with ArrayBuffers)
  console.log(msg);
  var spark = new SparkMD5.ArrayBuffer();
  spark.append(toArrayBuffer(msg));
  var hash = spark.end();
  this.logger.debug('_handleBinary: hash='+hash);

  var req = this.waitingOnBuffer[username];
  // Create a new record
  var newRecord = new CachedBuffer({
    key: hash,
    value: msg,
    created: new Date(),
    lastAccessed: new Date()
  });

  if (req.value !== hash) {
    this.logger.error('StorageSiteHandler._handleBinary: expecting buffer with hash '+req.value);
    this.logger.error('StorageSiteHandler._handleBinary: got buffer with hash '+hash);
    this._onError(username, req, new Error('received wrong buffer'));
    return;
  }

  newRecord.save(function(username, req, err) {
    if (err) { 
      this._onError(username, req, err);
      return;
    }
    this.logger.debug('_handleBinary: buffer saved sending final message to client');
    req.needBufferFromClient = false;
    req.bufferSetDone = true;
    this.clients[username].send(JSON.stringify(req));
    delete this.waitingOnBuffer[username];
  }.bind(this, username, req));
  this.logger.trace('_handleBinary: exit');
};

StorageSiteHandler.prototype.keys = function(username, req) {
  this.logger.trace('_handlers.keys: enter');
  Storage.find({ username: username}, 'key').exec().then(function(username, req, docs) {
    var retValue = [];
    if (docs) {
      for (var i=0; i<docs.length; i++) {
        retValue.push(docs[i].key);
      }
    }
    req.ret = retValue;
    this.logger.debug('_handlers.keys: returning ' + JSON.stringify(retValue));
    this.clients[username].send(JSON.stringify(req));
  }.bind(this, username, req)).onReject(this._onError.bind(this, username, req));
  this.logger.trace('_handlers.keys: exit');
};

StorageSiteHandler.prototype.get = function(username, req) {
  this.logger.trace('_handlers.get: enter');
  Storage.findOneAndUpdate(
    { username: username, key: req.key }, 
    { lastAccessed: new Date() }
  ).exec().then(function(username, req, doc) {
    var retValue = null;
    if (doc) { retValue = doc.value; }
    req.ret = retValue;
    if (!req.valueIsHash) {
      this.logger.debug('_handlers.get: returning ' + retValue);
      this.clients[username].send(JSON.stringify(req));
      return 'DONE';
    } else if (retValue === null) {
      return null;
    } else {
      this.logger.debug('_handlers.get: searching for buffer '+req.ret);
      return CachedBuffer.findOneAndUpdate(
        { key: retValue }, 
        { lastAccessed: new Date() }
      ).exec();
    }
  }.bind(this, username, req)).then(function(username, req, doc) {
    if (doc == 'DONE') { return 'DONE'; }
    var retValue = null;
    if (doc !== null) { 
      req.ret = doc.key;
      retValue = doc.value; 
    }
    this.logger.debug('_handlers.get: returning buffer ' + doc.key);
    this.clients[username].send(retValue, { binary:true });
    req.bufferSetDone = true;
    this.clients[username].send(JSON.stringify(req));
    return 'DONE';
  }.bind(this, username, req)).onReject(this._onError.bind(this, username, req));
  this.logger.trace('_handlers.get: exit');
};

StorageSiteHandler.prototype.set = function(username, req) {
  this.logger.trace('_handlers.set: enter');
  Storage.findOneAndUpdate(
    { username: username, key: req.key }, 
    { 
      username: username,
      key: req.key,
      valueIsHash: req.valueIsHash,
      value: req.value,
      lastUpdated: new Date() 
    },
    {
      new: false,
      upsert: true
    }
  ).exec().then(function(username, req, doc) {
    var retValue = null;
    if (doc) { retValue = doc.value; }
    req.ret = retValue;
    if (!req.valueIsHash) { // Dealing with strings. We're done
      this.logger.debug('_handlers.set: returning ' + req.ret);
      this.clients[username].send(JSON.stringify(req));
      return 'DONE';
    } else {  // Check to see if the new value already exists
      this.logger.debug('_handlers.set: searching for buffer ' + req.value);
      //If from transport, get rid of expiration
      return CachedBuffer.findOneAndUpdate(
        { key: req.value },
        { lastAccessed: new Date(), $unset: {expires: ""} }
      ).exec();
    }
  }.bind(this, username, req)).then(function(username, req, doc) {
    if (doc == 'DONE') { return 'DONE'; } 
    if (doc) {  // We have it already!
      this.logger.debug('_handlers.set: already have buffer');
      req.needBufferFromClient = false;
      req.bufferSetDone = true;
    } else {    // Request buffer from the client
      this.logger.debug('_handlers.set: requesting buffer from client');
      req.needBufferFromClient = true;
      req.bufferSetDone = false;
      this.waitingOnBuffer[username] = req;
    }
    this.logger.debug('_handlers.set: searching for old buffer to return: '+req.ret);
    if (req.ret === null) {
      return null;
    } else {
      var oldHash = req.ret;
      return CachedBuffer.findOneAndUpdate(
        { key: oldHash },
        { lastAccessed: new Date() }
      ).exec();
    }
  }.bind(this, username, req)).then(function(username, req, doc) {
    if (doc == 'DONE') { return 'DONE'; } 
    this.logger.debug('_handlers.set: returning old buffer');
    var retValue = null;
    if (doc !== null) { retValue = doc.value; }
    // Send back the old buffer value
    this.clients[username].send(retValue, { binary:true });
    // This either signals that we're done, or we need the buffer
    this.clients[username].send(JSON.stringify(req));
  }.bind(this, username, req)).onReject(this._onError.bind(this, username, req));
  this.logger.trace('_handlers.set: exit');
};

StorageSiteHandler.prototype.remove = function(username, req) {
  this.logger.trace('_handlers.remove: enter');
  Storage.findOneAndRemove(
    { username: username, key: req.key }
  ).exec().then(function(username, req, doc) {
     var retValue = null;
    if (doc) { retValue = doc.value; }
    req.ret = retValue;
    if (!req.valueIsHash) {
      this.logger.debug('_handlers.get: returning ' + retValue);
      this.clients[username].send(JSON.stringify(req));
      return 'DONE';
    } else if (retValue === null) {
      return null;
    } else {
      this.logger.debug('_handlers.get: searching for buffer '+req.ret);
      return CachedBuffer.findOneAndUpdate(
        { key: retValue }, 
        { lastAccessed: new Date() }
      ).exec();
    }
  }.bind(this, username, req)).then(function(username, req, doc) {
    if (doc == 'DONE') { return 'DONE'; }
    var retValue = null;
    if (doc !== null) { 
      req.ret = doc.key;
      retValue = doc.value; 
    }
    this.logger.debug('_handlers.get: returning buffer ' + doc.key);
    this.clients[username].send(retValue, { binary:true });
    req.bufferSetDone = true;
    this.clients[username].send(JSON.stringify(req));
    return 'DONE';
  }.bind(this, username, req)).onReject(this._onError.bind(this, username, req));
  this.logger.trace('_handlers.remove: exit');
};

StorageSiteHandler.prototype.clear = function(username, req) {
  this.logger.trace('_handlers.clear: enter');
  Storage.remove(
    { username: username }
  ).exec().then(function(username, req) {
    req.ret = null;
    this.logger.debug('_handlers.clear: success, returning null');
    this.clients[username].send(JSON.stringify(req));
  }.bind(this, username, req)).onReject(this._onError.bind(this, username, req));
  this.logger.trace('_handlers.clear: exit');
};

StorageSiteHandler.prototype._onError = function(username, req, err) {
  this.logger.error('_onError: mongoose error');
  this.logger.error(err.message);
  req.err = "UNKNOWN";
  this.clients[username].send(JSON.stringify(req));
};

/**
 * Handler for 'close' event from a WebSocket
 **/
StorageSiteHandler.prototype._onClose = function(username) {
  this.logger.trace('_onClose: enter');
  this.logger.debug('_onClose: '+username+' closed connection');
  delete this.clients[username];
  this.logger.trace('_onClose: exit');
};

function toArrayBuffer(buffer) {
  var ab = new ArrayBuffer(buffer.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return ab;
}
function toBuffer(ab) {
  var buffer = new Buffer(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i];
  }
  return buffer;
}


module.exports = StorageSiteHandler;
