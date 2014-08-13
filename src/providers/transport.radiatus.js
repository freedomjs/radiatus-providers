/*globals freedom:true, WebSocket, DEBUG */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Implementation of the Transport provider that communicates with
 * a radiatus-providers server
 **/
var D = true;

function RadiatusTransportProvider(dispatchEvent, webSocket) {
  this.dispatchEvent = dispatchEvent;
  this.websocket = freedom["core.websocket"] || webSocket;
  this.ERRCODE = freedom.transport().ERRCODE;

  this.name = null;
  this.conn = null;
  this.peerChannel = null;
  this.cachedBuffer = new CachedBuffer();

  this.isInitializing = false;
  this.liveRequests = {};
  this.queuedRequests = [];

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
    this.peerChannel.send(JSON.stringify({cmd: 'ready'}));
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
  if (this.conn === null) {
    continuation(undefined, this._createError('OFFLINE'));
  } 

  var id = Math.random()+'';
  var hash = this.cachedBuffer.add(data, id);
  if (D) console.log('RadiatusTransportProvider.send: hash='+hash);
  var req = {
    id: id,
    cmd: 'send',
    tag: tag,
    hash: hash
  };

  if (this.initializing === true) {
    this.queuedRequests.push({ text: JSON.stringify(req) });
  } else {
    this.conn.send({ text: JSON.stringify(req) });
  }

  req.tag = tag;
  req.continuation = continuation;
  this.liveRequests[id] = req;

};

RadiatusTransportProvider.prototype.close = function(continuation) {
  if (D) console.log("RadiatusTransportProvider.close: enter");
  // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#close%28%29
  this.conn.close(1000, "Close called").then(continuation);
  this.conn = null;
  this.peerChannel.close();
  this.peerChannel = null;
  this.dispatchEvent('onClose', {});
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
  if (D) console.log('RadiatusTransportProvider._onPeerMessage: ' + msg);
  try {
    var parsedMsg = JSON.parse(msg);
    if (parsedMsg.cmd == 'ready') {
    // If my own send request, then this is an acknowledgement from peer
    } else if (this.liveRequests.hasOwnProperty(parsedMsg.id)) {  
      this.liveRequests[parsedMsg.id].continuation(null);
      delete this.liveRequests[parsedMsg.id];
    // Peer is trying to send me something, get it from the server
    } else {
      var req = {
        id: Math.random()+'',
        cmd: 'receive',
        tag: parsedMsg.tag,
        hash: parsedMsg.hash,
        senderReq: parsedMsg,
      };
      this.conn.send({ text: JSON.stringify(req) });
    }
  } catch (e) {
    console.error('RadiatusTransportProvider._onPeerMessage: error handling message');
    console.error(e);
  }
};

RadiatusTransportProvider.prototype._onServerMessage = function(finishSetup, msg) {
  if (D) console.log('RadiatusTransportProvider._onServerMessage: ' + JSON.stringify(msg));
  // Cache binary objects
  if (msg.buffer) {
    if (D) console.log('RadiatusTransportProvider._onMessage: caching ArrayBuffer');
    this.cachedBuffer.add(msg.buffer);
    return;
  } else if (msg.binary) {
    if (D) console.log('RadiatusTransportProvider._onMessage: caching Blob');
    this.cachedBuffer.addBlob(msg.binary);
    return;
  }

  // Process strings
  try {
    var parsedMsg = JSON.parse(msg.text);
    var id = parsedMsg.id;
    if (parsedMsg.cmd == 'ready') {
      if (D) console.log('RadiatusTransportProvider._onServerMessage: ready');
      this.isInitializing = false;
      finishSetup.finish(null);
      while(this.queuedRequests.length > 0) {
        this.conn.send(this.queuedRequests.shift());
      }
      return;
    } else if (typeof parsedMsg.err !== 'undefined') {
      console.error('RadiatusTransportProvider.send: return error - ' + parsedMsg.err);
      this.liveRequests[id].continuation(undefined, this._createError(parsedMsg.err));
      delete this.liveRequests[id];
    } else if (parsedMsg.cmd == 'send' && parsedMsg.bufferSetDone === true) {
      if (D) console.log('RadiatusTransportProvider._onServerMessage: buffer is cached on server');
      if (D) console.log('RadiatusTransportProvider._onServerMessage: informing peer to D/L it');
      this.peerChannel.send(JSON.stringify(this.liveRequests[id]));
    } else if (parsedMsg.cmd == 'send' && parsedMsg.needBufferFromClient === true) {
      if (D) console.log('RadiatusTransportProvider._onServerMessage: sending buffer to server '+parsedMsg.hash);
      var buf = this.cachedBuffer.retrieve(parsedMsg.hash, parsedMsg.id);
      if (buf !== null) {
        this.conn.send({ buffer: buf });
      } else {
        console.error('RadiatusTransportProvider._onServerMessage: missing buffer '+parsedMsg.hash);
      }
    } else if (parsedMsg.cmd === 'receive' && parsedMsg.bufferSent === true) {
      if (D) console.log('RadiatusTransportProvider._onServerMessage receive: returns buffer with hash '+parsedMsg.hash);
      this.peerChannel.send(JSON.stringify(parsedMsg.senderReq));
      this.dispatchEvent('onData', {
        tag: parsedMsg.tag,
        data: this.cachedBuffer.retrieve(parsedMsg.hash)
      });
    } else {
      console.error('RadiatusTransportProvider._onServerMessage: unrecognized message');
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

