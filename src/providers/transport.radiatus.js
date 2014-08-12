/*globals freedom:true, WebSocket, DEBUG */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Implementation of the Transport provider that communicates with
 * a radiatus-providers server
 **/
var D = true;

function RadiatusTransportProvider(dispatchEvent, webSocket) {
  this.dispatchEvent = dispatchEvent;
  this.cachedBuffer = new CachedBuffer();
  this.websocket = freedom["core.websocket"] || webSocket;
  this.ERRCODE = freedom.transport().ERRCODE;
  this.conn = null;
  this.isInitializing = false;
  this.liveRequests = {};
  this.queuedRequests = [];

  this.name = null;
  this.peerChannel = null;

  if (typeof DEBUG !== 'undefined' && DEBUG) {
    this.WS_URL = 'ws://localhost:8082/route/?freedomAPI=transport' +
      '&radiatusSecret=secret' +
      '&radiatusUsername=alice';
  } else {
    // TBD where this sits in production
    this.WS_URL = 'ws://localhost:8082/route/?freedomAPI=transport';
  }
  if (D) console.log("Radiatus Transport Provider, running in worker " + self.location.href);
}

/** INTERFACE **/
RadiatusTransportProvider.prototype.setup = function(name, channelId, continuation) {
  if (D) console.log("RadiatusTransportProvider.setup: enter");
  this.initializing = true;
  this.name = name;

  var finishSetup = {
    continuation: continuation,
    finish: function(msg, err) {
      if (this.continuation) {
        this.continuation(msg, err);
        delete this.continuation;
      }
    }
  };

  freedom.core().bindChannel(channelId).then(function(channel) {
    if (D) console.log('RadiatusTransportProvider.setup: channel bound '+channelId);
    this.peerChannel = channel;
    this.peerChannel.on('message', this._onPeerMessage.bind(this));
    this.peerChannel.send = function(msg) {
      if (D) console.log('RadiatusTransportProvider.peerChannel.emit: ' + JSON.stringify(msg));
      this.peerChannel.emit('message', msg);
    }.bind(this);
    this.peerChannel.emit('ready');
    this.peerChannel.send('!!!');
  }.bind(this), function(err) {
    console.error('RadiatusTransportProvider.setup: error binding channel '+channelId);
    console.error(err);
  });  
  
  this.conn = this.websocket(this.WS_URL);
  this.conn.on("onMessage", this._onServerMessage.bind(this, finishSetup));
  this.conn.on("onError", function (continuation, error) {
    this.conn = null;
    console.error('RadiatusTransportProvider.conn.onError event');
    console.error(error);
    continuation(undefined, this._createError('UNKNOWN'));
  }.bind(this, continuation));
  this.conn.on("onClose", function (msg) {
    if (D) console.log('RadiatusTransportProvider.conn.onClose event');
    this.dispatchEvent('onClose', {});
    this.conn = null;
  }.bind(this));

};

RadiatusTransportProvider.prototype.send = function(tag, data, continuation) {
  if (D) console.log("RadiatusTransportProvider.send: tag="+tag);

};

RadiatusTransportProvider.prototype.close = function(continuation) {
  if (D) console.log("RadiatusTransportProvider.close: enter");
  // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#close%28%29
  this.conn.close(1000, "Close called").then(continuation);
  this.conn = null;
};

/** INTERNAL **/

RadiatusTransportProvider.prototype._createError = function(code) {
  if (typeof code == 'undefined') { return undefined; }
  var err = {
    errcode: code,
    message: this.ERRCODE[code]
  };
  return err;
};

RadiatusTransportProvider.prototype._onPeerMessage = function(msg) {
  if (D) console.log('RadiatusTransportProvider._onPeerMessage: ' + JSON.stringify(msg));

};

RadiatusTransportProvider.prototype._onServerMessage = function(finishSetup, msg) {
  if (D) console.log('RadiatusTransportProvider._onServerMessage: ' + JSON.stringify(msg));
  try {
    var parsedMsg = JSON.parse(msg.text);
    if (parsedMsg.cmd == 'ready') {
      finishSetup.finish(null);
    }

  } catch (e) {
    console.error('RadiatusTransportProvider._onServerMessage: error handling');
    console.log(e);
  }
};

/** REGISTER PROVIDER **/
if (typeof freedom !== 'undefined' &&
    typeof freedom.transport !== 'undefined') {
  freedom.transport().provideAsynchronous(RadiatusTransportProvider);
}

