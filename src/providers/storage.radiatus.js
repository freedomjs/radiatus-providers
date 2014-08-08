/*globals freedom:true, WebSocket, DEBUG */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Implementation of the Storage provider that communicates with
 * a radiatus-providers server
 **/
function RadiatusStorageProvider(dispatchEvent, webSocket) {
  this.dispatchEvent = dispatchEvent;
  this.websocket = freedom["core.websocket"] || webSocket;
  this.storage = freedom.storage();
  this.conn = null;

  if (typeof DEBUG !== 'undefined' && DEBUG) {
    this.WS_URL = 'ws://localhost:8082/route/?freedomAPI=storage';
  } else {
    // TBD where this sits in production
    this.WS_URL = 'ws://localhost:8082/route/?freedomAPI=storage';
  }
  this._initialize();
  //console.log("Radiatus Storage Provider, running in worker " + self.location.href);
}

/** INTERFACE **/
RadiatusStorageProvider.prototype.keys = function(continuation) {
  //this.store.keys().then(continuation);
};

RadiatusStorageProvider.prototype.get = function(key, continuation) {
  //this.store.get(key).then(continuation);
};

RadiatusStorageProvider.prototype.set = function(key, value, continuation) {
  //this.store.set(key, value).then(continuation);
};

RadiatusStorageProvider.prototype.remove = function(key, continuation) {
  //this.store.remove(key).then(continuation);
};

RadiatusStorageProvider.prototype.clear = function(continuation) {
  //this.store.clear().then(continuation);
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

  } catch (e) {
    console.error(e);
  }
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
