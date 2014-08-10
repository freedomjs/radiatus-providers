var Storage = require('./models/storage');
/**
 * Site Handler for Storage
 * - supports requests from the storage and storebuffer
 *   APIs, so must make check to see if binaries are on the line
 **/
function StorageSiteHandler(logger) {
  this.logger = logger;
  this.clients = {};      //Store active clients
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
StorageSiteHandler.prototype._onMessage = function(username, msg) {
  this.logger.trace('_onMessage: enter');
  this.logger.debug('_onMessage: message from '+username);
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
    req.ret = doc.value;
    this.logger.debug('_handlers.get: returning ' + doc.value);
    this.clients[username].send(JSON.stringify(req));
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
    this.logger.debug('_handlers.set: returning ' + req.ret);
      
    if (!req.valueIsHash) {
      this.clients[username].send(JSON.stringify(req));
      return 'DONE';
    } else if (retValue === null) {
      return null;
    } else {
      return CachedBuffer.findOne({ key: retValue }).exec();
    }
  }.bind(this, username, req)).then(function(username, req, doc) {
    if (doc == 'DONE') { return 'DONE'; } 
      
    var retValue = null;
    if (doc !== null) { retValue = doc.value; }
    this.clients[username].send(retValue, { binary:true });
    return CachedBuffer.find({ key: req.value }).exec();
  }.bind(this, username, req)).then(function(username, req, doc) {
    if (doc == 'DONE') { return 'DONE'; } 
    
    if (doc) {
      
    } else {

    }
  }.bind(this, username, req)).onReject(this._onError.bind(this, username, req));
  this.logger.trace('_handlers.set: exit');
};

StorageSiteHandler.prototype.remove = function(username, req) {
  this.logger.trace('_handlers.remove: enter');
  Storage.findOneAndRemove(
    { username: username, key: req.key }
  ).exec().then(function(username, req, doc) {
    req.ret = doc.value;
    this.logger.debug('_handlers.remove: returning ' + doc.value);
    this.clients[username].send(JSON.stringify(req));
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
  this.logger.error(err);
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


module.exports = StorageSiteHandler;
