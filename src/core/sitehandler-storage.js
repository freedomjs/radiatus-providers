var Storage = require('../models/storage');
var CachedBuffer = require('../models/cachedbuffer');
var ConnectionHandler = require('./connectionhandler');
var getLogger = require('../lib/logger');

/**
 * Site Handler for Storage
 * - supports requests from the storage and storebuffer
 *   APIs, so must make check to see if binaries are on the line
 **/
function StorageSiteHandler(appid) {
  "use strict";
  this.appid = appid;
  this.logger = getLogger(appid);
  this.clients = {};      //Store active clients
}

/**
 * Add a new WebSocket client
 * Set the appropriate listeners on the WebSocket
 **/
StorageSiteHandler.prototype.addConnection = function(username, ws) {
  "use strict";
  this.logger.debug(username+'.addConnection: enter');

  // Store new client
  if (!this.clients.hasOwnProperty(username)) { 
    this.clients[username] = [];
  }
  var connHandler = new ConnectionHandler(this.appid, username, ws);
  this.clients[username].push(connHandler);

  ws.on('message', this._onMessage.bind(this, connHandler));
  ws.on('close', this._onClose.bind(this, connHandler));
  // Send back a ready signal
  ws.send(JSON.stringify({
    'method': 'ready',
    'userId': username,
  }));

  this.logger.trace(username+'.addConnection: exit');
};


/** HANDLE INCOMING MESSAGES **/
/**
 * Handler for incoming message on a WebSocket connection
 **/
StorageSiteHandler.prototype._onMessage = function(connHandler, msg, flags) {
  "use strict";
  this.logger.trace(connHandler.id()+'._onMessage: enter');
  
  // Reroute binary messages
  if (flags.binary) {
    connHandler.handleBinary(msg, false);
    return;
  }

  // Process strings
  try {
    this.logger.debug(connHandler.id()+'._onMessage:'+msg);
    var parsedMsg = JSON.parse(msg);
    //Reroute method calls
    if (parsedMsg.hasOwnProperty('method') &&
        this[parsedMsg.method]) {
      this[parsedMsg.method].bind(this)(connHandler, parsedMsg);
    } else {
      this.logger.warn(connHandler.id()+'._onMessage: invalid request ' + msg);  
    }
  } catch (e) {
    this.logger.error(connHandler.id()+'_onMessage: failed processing message, error='+e.message);
    this.logger.error(e.stack);
  }
  this.logger.trace(connHandler.id()+'_onMessage: exit');
};

/** METHOD HANDLERS **/

StorageSiteHandler.prototype.keys = function(connHandler, req) {
  "use strict";
  this.logger.trace(connHandler.id()+'._handlers.keys: enter');
  Storage.find({ username: connHandler.username}, 'key').exec().then(function(connHandler, req, docs) {
    var retValue = [];
    if (docs) {
      for (var i=0; i<docs.length; i++) {
        retValue.push(docs[i].key);
      }
    }
    req.ret = retValue;
    this.logger.debug(connHandler.id()+'._handlers.keys: returning ' + JSON.stringify(retValue));
    connHandler.websocket.send(JSON.stringify(req));
  }.bind(this, connHandler, req)).onReject(this._onError.bind(this, connHandler, req));
  this.logger.trace(connHandler.id()+'._handlers.keys: exit');
};

StorageSiteHandler.prototype.get = function(connHandler, req) {
  "use strict";
  this.logger.trace(connHandler.id()+'._handlers.get: enter');
  Storage.findOneAndUpdate(
    { username: connHandler.username, key: req.key }, 
    { lastAccessed: new Date() }
  ).exec().then(function(connHandler, req, doc) {
    var retValue = null;
    if (doc) { retValue = doc.value; }
    req.ret = retValue;
    if (!req.valueIsHash) {
      this.logger.debug(connHandler.id()+'._handlers.get: returning ' + retValue);
      connHandler.websocket.send(JSON.stringify(req));
      return 'DONE';
    } else if (retValue === null) {
      return null;
    } else {
      this.logger.debug(connHandler.id()+'._handlers.get: searching for buffer '+retValue);
      return CachedBuffer.findOneAndUpdate(
        { key: retValue }, 
        { lastAccessed: new Date() }
      ).exec();
    }
  }.bind(this, connHandler, req)).then(function(connHandler, req, doc) {
    if (doc === 'DONE') { return 'DONE'; }
    var retValue = null;
    if (doc !== null) { 
      req.ret = doc.key;
      retValue = doc.value; 
    }
    this.logger.debug(connHandler.id()+'._handlers.get: returning buffer '+doc.key);
    if (retValue && retValue.length) {
      this.logger.debug('._handlers.get: length='+retValue.length);
    }
    connHandler.websocket.send(retValue, { binary:true });
    req.bufferSetDone = true;
    connHandler.websocket.send(JSON.stringify(req));
    return 'DONE';
  }.bind(this, connHandler, req)).onReject(this._onError.bind(this, connHandler, req));
  this.logger.trace(connHandler.id()+'._handlers.get: exit');
};

StorageSiteHandler.prototype.set = function(connHandler, req) {
  "use strict";
  this.logger.trace(connHandler.id()+'._handlers.set: enter');
  Storage.findOneAndUpdate(
    { username: connHandler.username, key: req.key }, 
    { 
      username: connHandler.username,
      key: req.key,
      valueIsHash: req.valueIsHash,
      value: req.value,
      lastUpdated: new Date() 
    },
    {
      new: false,
      upsert: true
    }
  ).exec().then(function(connHandler, req, doc) {
    var retValue = null;
    if (doc) { retValue = doc.value; }
    req.ret = retValue;
    if (!req.valueIsHash) { // Dealing with strings. We're done
      this.logger.debug(connHandler.id()+'._handlers.set: returning ' + req.ret);
      connHandler.websocket.send(JSON.stringify(req));
      return 'DONE';
    } else {  // Check to see if the new value already exists
      this.logger.debug(connHandler.id()+'._handlers.set: searching for buffer ' + req.value);
      //If from transport, get rid of expiration
      return CachedBuffer.findOneAndUpdate(
        { key: req.value },
        { lastAccessed: new Date(), $unset: {expires: ""} }
      ).exec();
    }
  }.bind(this, connHandler, req)).then(function(connHandler, req, doc) {
    if (doc === 'DONE') { return 'DONE'; } 
    if (doc) {  // We have it already!
      this.logger.debug(connHandler.id()+'._handlers.set: already have buffer');
      req.needBufferFromClient = false;
      req.bufferSetDone = true;
    } else {    // Request buffer from the client
      this.logger.debug(connHandler.id()+'._handlers.set: requesting buffer from client');
      req.needBufferFromClient = true;
      req.bufferSetDone = false;
      connHandler.binaryCallback(req.value, function(connHandler, req, err) {
        if (err) { 
          this._onError(connHandler, req, err);
          return;
        }
        this.logger.debug(connHandler.id()+'.handleBinary: buffer saved sending final message to client');
        req.needBufferFromClient = false;
        req.bufferSetDone = true;
        connHandler.websocket.send(JSON.stringify(req));
      }.bind(this, connHandler, req));
    }
    this.logger.debug(connHandler.id()+'._handlers.set: searching for old buffer to return: '+req.ret);
    if (req.ret === null) {
      return null;
    } else {
      var oldHash = req.ret;
      return CachedBuffer.findOneAndUpdate(
        { key: oldHash },
        { lastAccessed: new Date() }
      ).exec();
    }
  }.bind(this, connHandler, req)).then(function(connHandler, req, doc) {
    if (doc === 'DONE') { return 'DONE'; } 
    this.logger.debug(connHandler.id()+'._handlers.set: returning old buffer');
    var retValue = null;
    if (doc !== null) { retValue = doc.value; }
    // Send back the old buffer value
    connHandler.websocket.send(retValue, { binary:true });
    // This either signals that we're done, or we need the buffer
    connHandler.websocket.send(JSON.stringify(req));
  }.bind(this, connHandler, req)).onReject(this._onError.bind(this, connHandler, req));
  this.logger.trace(connHandler.id()+'._handlers.set: exit');
};

StorageSiteHandler.prototype.remove = function(connHandler, req) {
  "use strict";
  this.logger.trace(connHandler.id()+'._handlers.remove: enter');
  Storage.findOneAndRemove(
    { username: connHandler.username, key: req.key }
  ).exec().then(function(connHandler, req, doc) {
     var retValue = null;
    if (doc) { retValue = doc.value; }
    req.ret = retValue;
    if (!req.valueIsHash) {
      this.logger.debug(connHandler.id()+'._handlers.get: returning ' + retValue);
      connHandler.websocket.send(JSON.stringify(req));
      return 'DONE';
    } else if (retValue === null) {
      return null;
    } else {
      this.logger.debug(connHandler.id()+'._handlers.get: searching for buffer '+req.ret);
      return CachedBuffer.findOneAndUpdate(
        { key: retValue }, 
        { lastAccessed: new Date() }
      ).exec();
    }
  }.bind(this, connHandler, req)).then(function(connHandler, req, doc) {
    if (doc === 'DONE') { return 'DONE'; }
    var retValue = null;
    if (doc !== null) { 
      req.ret = doc.key;
      retValue = doc.value; 
    }
    this.logger.debug(connHandler.id()+'._handlers.get: returning buffer ' + doc.key);
    connHandler.websocket.send(retValue, { binary:true });
    req.bufferSetDone = true;
    connHandler.websocket.send(JSON.stringify(req));
    return 'DONE';
  }.bind(this, connHandler, req)).onReject(this._onError.bind(this, connHandler, req));
  this.logger.trace(connHandler.id()+'._handlers.remove: exit');
};

StorageSiteHandler.prototype.clear = function(connHandler, req) {
  "use strict";
  this.logger.trace(connHandler.id()+'._handlers.clear: enter');
  Storage.remove(
    { username: connHandler.username }
  ).exec().then(function(connHandler, req) {
    req.ret = null;
    this.logger.debug(connHandler.id()+'._handlers.clear: success, returning null');
    connHandler.websocket.send(JSON.stringify(req));
  }.bind(this, connHandler, req)).onReject(this._onError.bind(this, connHandler, req));
  this.logger.trace(connHandler.id()+'._handlers.clear: exit');
};

/**
 * Handler for when promises from mongoose calls are rejected
 **/
StorageSiteHandler.prototype._onError = function(connHandler, req, err) {
  "use strict";
  this.logger.error(connHandler.id()+'._onError: mongoose error='+err.message);
  req.err = "UNKNOWN";
  connHandler.websocket.send(JSON.stringify(req));
};

/**
 * Handler for 'close' event from a WebSocket
 **/
StorageSiteHandler.prototype._onClose = function(connHandler) {
  "use strict";
  this.logger.debug(connHandler.id()+'._onClose: closed connection');
  this.clients[connHandler.username] = this.clients[connHandler.username].filter(function(connHandler, elt) {
    return connHandler !== elt;
  }.bind(this, connHandler));
  //delete this.clients[username];
  this.logger.trace(connHandler.id()+'._onClose: exit');
};

module.exports = StorageSiteHandler;
