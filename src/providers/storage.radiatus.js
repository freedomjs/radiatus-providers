/*globals freedom:true, WebSocket, DEBUG */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Implementation of the Storage provider that communicates with
 * a radiatus-providers server
 **/
var D = false;

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
  if (D) console.log("Radiatus Storage Provider, running in worker " + self.location.href);
}

/** INTERFACE **/
RadiatusStorageProvider.prototype.keys = function(continuation) {
  if (D) console.log('RadiatusStorageProvider.keys');
  this._createRequest('keys', null, null, continuation);
};

RadiatusStorageProvider.prototype.get = function(key, continuation) {
  if (D) console.log('RadiatusStorageProvider.get: key='+key);
  this._createRequest('get', key, null, continuation);
};

RadiatusStorageProvider.prototype.set = function(key, value, continuation) {
  if (D) console.log('RadiatusStorageProvider.set: key='+key+",value="+value);
  this._createRequest('set', key, value, continuation);
};

RadiatusStorageProvider.prototype.remove = function(key, continuation) {
  if (D) console.log('RadiatusStorageProvider.remove: key='+key);
  this._createRequest('remove', key, null, continuation);
};

RadiatusStorageProvider.prototype.clear = function(continuation) {
  if (D) console.log('RadiatusStorageProvider.clear');
  this._createRequest('clear', null, null, continuation);
};

/** INTERNAL **/
RadiatusStorageProvider.prototype._initialize = function() {
  if (D) console.log("RadiatusStorageProvider._initialize: enter");
  this.conn = this.websocket(this.WS_URL);
  this.conn.on("onMessage", this._onMessage.bind(this));
  this.conn.on("onError", function (error) {
    this.conn = null;
    console.error('RadiatusStorageProvider.conn.onError event');
    console.error(error);
  }.bind(this));
  this.conn.on("onClose", function (msg) {
    console.log('RadiatusStorageProvider.conn.onClose event');
    this.conn = null;
  }.bind(this));
};

RadiatusStorageProvider.prototype._onMessage = function(msg) {
  if (D) console.log('RadiatusStorageProvider._onMessage: ' + JSON.stringify(msg));

  // Cache binary objects
  if (msg.buffer) {
    if (D) console.log('RadiatusStorageProvider._onMessage: caching ArrayBuffer');
    this.cachedBuffer.add(msg.buffer);
    return;
  } else if (msg.binary) {
    if (D) console.log('RadiatusStorageProvider._onMessage: caching Blob');
    var fr;
    if (typeof FileReaderSync !== 'undefined') {
      fr = new FileReaderSync();
      this.cachedBuffer.add(fr.readAsArrayBuffer(msg.binary));
    } else if (typeof FileReader !== 'undefined') {
      fr = new FileReader();
      fr.onload = function(e) {
        this.cachedBuffer.add(e.target.result);
      }.bind(this);
      fr.readAsArrayBuffer(msg.binary);
    } else {
      console.error('RadiatusStorageProvider._onMessage: no idea how to read Blob');
    }
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
      console.error('RadiatusStorageProvider.'+parsedMsg.method+': return error - ' + parsedMsg.err);
      this.liveRequests[id].continuation(undefined, this._createError(parsedMsg.err));
      delete this.liveRequests[id];
    } else if (typeof parsedMsg.ret !== 'undefined' &&
        parsedMsg.valueIsHash === false) {
      if (D) console.log('RadiatusStorageProvider.'+parsedMsg.method+': returns ' + parsedMsg.ret);
      this.liveRequests[id].continuation(parsedMsg.ret);
      delete this.liveRequests[id];
    } else if (parsedMsg.method == 'keys' || parsedMsg.method == 'clear') {
      if (D) console.log('RadiatusStorageProvider.'+parsedMsg.method+': returns ' + parsedMsg.ret);
      this.liveRequests[id].continuation(parsedMsg.ret);
      delete this.liveRequests[id];
    } else if (parsedMsg.needBufferFromClient === true &&
        parsedMsg.bufferSetDone === false &&
        parsedMsg.method == 'set') {
      if (D) console.log('RadiatusStorageProvider._onMessage: sending buffer '+parsedMsg.value);
      var buf = this.cachedBuffer.retrieve(parsedMsg.value, parsedMsg.id);
      if (buf !== null) {
        this.conn.send({ buffer: buf });
      } else {
        console.error('RadiatusStorageProvider._onMessage: missing buffer '+parsedMsg.value);
      }
    } else if (parsedMsg.bufferSetDone === true && 
        (parsedMsg.method == 'set' || parsedMsg.method == 'get' || parsedMsg.method == 'remove')) {
      if (D) console.log('RadiatusStorageProvider.'+parsedMsg.method+': returns buffer with hash '+parsedMsg.ret);
      if (parsedMsg.ret === null) {
        this.liveRequests[id].continuation(null); 
      } else {
        this.liveRequests[id].continuation(this.cachedBuffer.retrieve(parsedMsg.ret)); 
      }
      delete this.liveRequests[id];
    } else {
      console.error('RadiatusStorageProvider._onMessage: cannot handle ' + msg.text);
    }
  } catch (e) {
    console.error('RadiatusStorageProvider._onMessage: failed handling message');
    console.error(e);
  }
};

RadiatusStorageProvider.prototype._createRequest = function(method, key, value, cont) {
  //DEBUG just for testing
  if (DEBUG) { this.cachedBuffer.clear(); }
  //DEBUG
  if (this.conn === null) {
    console.error('RadiatusStorageProvider.'+method+': returning error OFFLINE');
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
  if (D) console.log('RadiatusStorageProvider._createRequest: ' + JSON.stringify(request));

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
