/*globals freedom:true, WebSocket, DEBUG */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Implementation of the Storage provider that communicates with
 * a radiatus-providers server
 **/
var DEBUGLOGGING = false;

function RadiatusStorageProvider(dispatchEvent, webSocket) {
  this.dispatchEvent = dispatchEvent;
  this.cachedBuffer = new CachedBuffer();
  this.websocket = freedom["core.websocket"] || webSocket;
  if (typeof freedom.storage !== 'undefined') {
    this.ERRCODE = freedom.storage().ERRCODE;
    this.valueIsHash = false;
  } else if (typeof freedom.storebuffer !== 'undefined') {
    this.ERRCODE = freedom.storebuffer().ERRCODE;
    this.valueIsHash = true;
  }
  this.conn = null;
  this.isInitializing = true;
  this.liveRequests = {};
  this.queuedRequests = [];

  if (typeof DEBUG !== 'undefined' && DEBUG) {
    this.WS_URL = 'ws://localhost:8082/route/?freedomAPI=storage' +
      '&radiatusSecret=secret' +
      '&radiatusUsername=alice';
  } else {
    // TBD where this sits in production
    this.WS_URL = 'ws://localhost:8082/route/?freedomAPI=storage';
  }
  this._initialize();
  //this.TRACE('constructor', 'running in worker '+self.location.href);
}

RadiatusStorageProvider.prototype.TRACE = function(method, msg) {
  if (DEBUGLOGGING) {
    console.log(
      'RadiatusStorageProvider.' + 
      //this.name + '.' +
      method +
      ':' + msg
    );
  }
};
RadiatusStorageProvider.prototype.ERROR = function(method, msg, err) {
  var toPrint = 'RadiatusStorageProvider.'+method+':';
  toPrint += msg;
  if (err && err.message) {
    toPrint += ', '+err.message;
  }
  console.error(toPrint);
  //console.trace();
  if (err) console.error(err);
};


/** INTERFACE **/
RadiatusStorageProvider.prototype.keys = function(continuation) {
  this.TRACE('keys', 'enter');
  this._createRequest('keys', null, null, continuation);
};

RadiatusStorageProvider.prototype.get = function(key, continuation) {
  this.TRACE('get', 'enter key='+key);
  this._createRequest('get', key, null, continuation);
};

RadiatusStorageProvider.prototype.set = function(key, value, continuation) {
  this.TRACE('set', 'enter key='+key+',value='+value);
  this._createRequest('set', key, value, continuation);
};

RadiatusStorageProvider.prototype.remove = function(key, continuation) {
  this.TRACE('remove', 'enter key='+key);
  this._createRequest('remove', key, null, continuation);
};

RadiatusStorageProvider.prototype.clear = function(continuation) {
  this.TRACE('clear', 'enter');
  this._createRequest('clear', null, null, continuation);
};

/** INTERNAL **/
RadiatusStorageProvider.prototype._initialize = function() {
  this.TRACE('_initialize', 'enter');
  this.conn = this.websocket(this.WS_URL);
  this.conn.on("onMessage", this._onMessage.bind(this));
  this.conn.on("onError", function (error) {
    this.conn = null;
    this.ERROR('conn.on', 'onError event', error);
  }.bind(this));
  this.conn.on("onClose", function (msg) {
    this.ERROR('conn.on', 'onClose event');
    this.conn = null;
  }.bind(this));
};

RadiatusStorageProvider.prototype._onMessage = function(msg) {
  this.TRACE('_onMessage', JSON.stringify(msg));

  // Cache binary objects
  if (msg.buffer) {
    this.TRACE('_onMessage', 'caching ArrayBuffer');
    this.cachedBuffer.add(msg.buffer);
    return;
  } else if (msg.binary) {
    this.TRACE('_onMessage', 'caching Blob');
    this.cachedBuffer.addBlob(msg.binary);
    return;
  }
  
  // Must be msg.text message, let's parse and handle it
  try {
    var parsedMsg = JSON.parse(msg.text);
    // On a 'ready' message, let's flush those initial requests
    if (parsedMsg.method == 'ready') {
      this.isInitializing = false;
      while(this.queuedRequests.length > 0) {
        this.conn.send(this.queuedRequests.shift());
      }
      return;
    }

    // Message Handling
    var id = parsedMsg.id;
    if (typeof parsedMsg.err !== 'undefined') {
      this.ERROR(parsedMsg.method, 'returns error '+parsedMsg.err);
      this.liveRequests[id].continuation(undefined, this._createError(parsedMsg.err));
      delete this.liveRequests[id];
    } else if (typeof parsedMsg.ret !== 'undefined' &&
        parsedMsg.valueIsHash === false) {
      this.TRACE(parsedMsg.method, 'returns '+parsedMsg.ret);
      this.liveRequests[id].continuation(parsedMsg.ret);
      delete this.liveRequests[id];
    } else if (parsedMsg.method == 'keys' || parsedMsg.method == 'clear') {
      this.TRACE(parsedMsg.method, 'returns ' + parsedMsg.ret);
      this.liveRequests[id].continuation(parsedMsg.ret);
      delete this.liveRequests[id];
    } else if (parsedMsg.needBufferFromClient === true &&
        parsedMsg.bufferSetDone === false &&
        parsedMsg.method == 'set') {
      this.TRACE('_onMessage', 'sending buffer '+parsedMsg.value);
      var buf = this.cachedBuffer.retrieve(parsedMsg.value, parsedMsg.id);
      if (buf !== null) {
        this.conn.send({ buffer: buf }).then(function() {
          this.TRACE('_onMessage', 'buffer successfully sent');
        }.bind(this), function(err) {
          this.ERROR('_onMessage', 'buffer failed to send', err);
        }.bind(this));//;
      } else {
        this.ERROR('_onMessage', 'missing buffer '+parsedMsg.value);
      }
    } else if (parsedMsg.bufferSetDone === true && 
        (parsedMsg.method == 'set' || parsedMsg.method == 'get' || parsedMsg.method == 'remove')) {
      this.TRACE(parsedMsg.method, 'returns buffer with hash '+parsedMsg.ret);
      if (parsedMsg.ret === null) {
        this.liveRequests[id].continuation(null); 
      } else {
        this.liveRequests[id].continuation(this.cachedBuffer.retrieve(parsedMsg.ret)); 
      }
      delete this.liveRequests[id];
    } else {
      this.ERROR('_onMessage', 'unrecognized command in '+msg.text);
    }
  } catch (e) {
    this.ERROR('_onMessage', 'failed handling message'+msg.text, e);
  }
};

RadiatusStorageProvider.prototype._createRequest = function(method, key, value, cont) {
  //DEBUG just for testing
  if (typeof DEBUG !== 'undefined' && DEBUG) { this.cachedBuffer.clear(); }
  //DEBUG
  if (this.conn === null) {
    this.ERROR(method, 'returning error OFFLINE');
    cont(undefined, this._createError("OFFLINE"));
    return;
  }

  var id = '' + Math.random();
  var request = {
    id: id,
    method: method,
    key: key,
    valueIsHash: this.valueIsHash,
    value: value
  };
  if (value !== null &&
      typeof value !== 'string') {  //Assume it's an ArrayBuffer
    request.valueIsHash = true;
    request.value = this.cachedBuffer.add(value, id);
  }
  this.TRACE('_createRequest', JSON.stringify(request));

  // Must wait until a server sends us something first
  // Otherwise, these messages get lost
  if (this.isInitializing) {
    this.queuedRequests.push({ text: JSON.stringify(request) });
  } else {
    this.conn.send({ text: JSON.stringify(request) });
  }

  request.continuation = cont;
  this.liveRequests[id] = request;
};

RadiatusStorageProvider.prototype._createError = function(code) {
  if (typeof code == 'undefined') { return undefined; }
  var err = {
    errcode: code,
    message: this.ERRCODE[code]
  };
  return err;
};


/** REGISTER PROVIDER **/
if (typeof freedom !== 'undefined' &&
    typeof freedom.storage !== 'undefined') {
  freedom.storage().provideAsynchronous(RadiatusStorageProvider);
}
if (typeof freedom !== 'undefined' &&
    typeof freedom.storebuffer !== 'undefined') {
  freedom.storebuffer().provideAsynchronous(RadiatusStorageProvider);
}
