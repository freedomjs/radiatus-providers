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
        this._handlers.hasOwnProperty(parsedMsg.method)) {
      this._handlers[parsedMsg.method].bind(this)(username, parsedMsg);
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

StorageSiteHandler.prototype._handlers = {
  keys: function(username, req) {
    this.logger.trace('_handlers.keys: enter');
    Storage.find({ username: username }, 'key', function(username, req, err, docs) {
      if (err) {
        this.logger.error('_handlers.keys: mongoose error');
        this.logger.error(err);
        req.err = "UNKNOWN";
      } else {
        var retValue = [];
        if (docs) {
          for (var i=0; i<docs.length; i++) {
            retValue.push(docs[i].key);
          }
        }
        req.ret = retValue;
        this.logger.debug('_handlers.keys: returning ' + JSON.stringify(retValue));
      }
      this.clients[username].send(JSON.stringify(req));
    }.bind(this, username, req));
    this.logger.trace('_handlers.keys: exit');
  },

  get: function(username, req) {
    this.logger.trace('_handlers.get: enter');
    Storage.findOneAndUpdate(
        { username: username, key: req.key }, 
        { lastAccessed: new Date() },
        function(username, req, err, doc) {
      if (err) {
        this.logger.error('_handlers.get: mongoose error');
        this.logger.error(err);
        req.err = 'UNKNOWN';
      } else if (doc) {
        req.ret = doc.value;
        this.logger.debug('_handlers.get: returning ' + doc.value);
      } else {
        req.ret = null;
        this.logger.debug('_handlers.get: returning null');
      }
      this.clients[username].send(JSON.stringify(req));
    }.bind(this, username, req));
    this.logger.trace('_handlers.get: exit');
  },

  set: function(username, req) {
    this.logger.trace('_handlers.set: enter');
    //@todo fill
    Storage.findOneAndUpdate(
        { username: username, key: req.key }, 
        { lastUpdated: new Date() },
        function(username, req, err, doc) {
      if (err) {
        this.logger.error('_handlers.set: mongoose error');
        this.logger.error(err);
        req.err = 'UNKNOWN';
        this.clients[username].send(JSON.stringify(req));
        return;
      } 

      if (doc) {
        req.ret = doc.value;
        doc.value = req.value;
      } else {
        req.ret = null;
        doc = new Storage({
          username: username,
          key: req.key,
          valueIsHash: false,
          value: req.value
        });
      }
      doc.save(function(username, req, err) {
        if (err) {
          this.logger.error('_handlers.set: mongoose error');
          this.logger.error(err);
          req.err = 'UNKNOWN';
          delete req.ret;
        }
        this.logger.debug('_handlers.set: returning ' + req.ret);
        this.clients[username].send(JSON.stringify(req));
      }.bind(this, username, req));
    }.bind(this, username, req));
    this.logger.trace('_handlers.set: exit');
  },

  remove: function(username, req) {
    this.logger.trace('_handlers.remove: enter');
    Storage.findOneAndRemove(
        { username: username, key: req.key }, 
        function(username, req, err, doc) {
      if (err) {
        this.logger.error('_handlers.remove: mongoose error');
        this.logger.error(err);
        req.err = 'UNKNOWN';
      } else if (doc) {
        req.ret = doc.value;
        this.logger.debug('_handlers.remove: returning ' + doc.value);
      } else {
        req.ret = null;
        this.logger.debug('_handlers.remove: returning null');
      }
      this.clients[username].send(JSON.stringify(req));
    }.bind(this, username, req));
    this.logger.trace('_handlers.remove: exit');
  },

  clear: function(username, req) {
    this.logger.trace('_handlers.clear: enter');
    Storage.remove(
        { username: username }, 
        function(username, req, err) {
      if (err) {
        this.logger.error('_handlers.clear: mongoose error');
        this.logger.error(err);
        req.err = 'UNKNOWN';
      } else {
        req.ret = null;
        this.logger.debug('_handlers.clear: success, returning null');
      }
      this.clients[username].send(JSON.stringify(req));
    }.bind(this, username, req));
    this.logger.trace('_handlers.clear: exit');
  },
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
