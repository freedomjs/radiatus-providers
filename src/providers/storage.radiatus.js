/*globals freedom:true, WebSocket, DEBUG */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Implementation of the Storage provider that communicates with
 * a radiatus-providers server
 **/
function RadiatusStorageProvider(dispatchEvent, webSocket) {
  this.dispatchEvent = dispatchEvent;
  this.websocket = freedom["core.websocket"] || webSocket;
  if (typeof freedom.storage !== 'undefined') {
    this.ERRCODE = freedom.storage().ERRCODE;
  } else if (typeof freedom.storebuffer !== 'undefined') {
    this.ERRCODE = freedom.storebuffer().ERRCODE;
  }
  this.conn = null;
  this.requests = {};
  this.requestId = 0;

  if (typeof DEBUG !== 'undefined' && DEBUG) {
    this.WS_URL = 'ws://localhost:8082/route/?freedomAPI=storage'
      + '&radiatusSecret=secret'
      + '&radiatusUsername=alice';
  } else {
    // TBD where this sits in production
    this.WS_URL = 'ws://localhost:8082/route/?freedomAPI=storage';
  }
  this._initialize();
  //console.log("Radiatus Storage Provider, running in worker " + self.location.href);
}

/** INTERFACE **/
RadiatusStorageProvider.prototype.keys = function(continuation) {
  this._createRequest('keys', null, null, continuation);
};

RadiatusStorageProvider.prototype.get = function(key, continuation) {
  this._createRequest('get', key, null, continuation);
};

RadiatusStorageProvider.prototype.set = function(key, value, continuation) {
  this._createRequest('set', key, value, continuation);
};

RadiatusStorageProvider.prototype.remove = function(key, continuation) {
  this._createRequest('remove', key, null, continuation);
};

RadiatusStorageProvider.prototype.clear = function(continuation) {
  this._createRequest('clear', null, null, continuation);
};

/** INTERNAL **/
RadiatusStorageProvider.prototype._initialize = function() {
  this.conn = this.websocket(this.WS_URL);
  this.conn.on("onMessage", this._onMessage.bind(this));
  this.conn.on("onError", function (error) {
    this.conn = null;
    console.error(error);
  }.bind(this));
  this.conn.on("onClose", function (msg) {
    this.conn = null;
  }.bind(this));
};

RadiatusStorageProvider.prototype._onMessage = function(msg) {
  try {
    console.log(msg.text);
    var parsedMsg = JSON.parse(msg.text);
    var id = parsedMsg.id;
    var ret = parsedMsg.ret;
    var err = parsedMsg.err;
    this.requests[id].continuation(ret, this._createError(err));
    delete this.requests[id];
  } catch (e) {
    console.error(e);
  }
};

RadiatusStorageProvider.prototype._createRequest = function(method, key, value, cont) {
  if (this.conn === null) {
    cont(undefined, this._createError("OFFLINE"));
    return;
  }

  var id = this.requestId++;
  var request = {
    id: id,
    method: method,
    key: key,
    value: value
  };
  this.conn.send({ text: JSON.stringify(request) });

  request.continuation = cont;
  this.requests[id] = request;
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
