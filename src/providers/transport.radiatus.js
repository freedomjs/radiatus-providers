/*globals freedom:true, WebSocket, DEBUG */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Implementation of the Transport provider that communicates with
 * a radiatus-providers server
 **/
var DEBUGLOGGING = false;

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

  this.TRACE('constructor', 'running in worker ' + self.location.href);
}

RadiatusTransportProvider.prototype.TRACE = function(method, msg) {
  if (DEBUGLOGGING) {
    console.log(
      'RadiatusTransportProvider.' + 
      this.name + '.' +
      method +
      ':' + msg
    );
  }
};
RadiatusTransportProvider.prototype.ERROR = function(method, msg, err) {
  var toPrint = 'RadiatusTransportProvider.'+this.name+'.'+method+':';
  toPrint += msg;
  if (err && err.message) {
    toPrint += ', '+err.message;
  }
  console.error(toPrint);
  console.trace();
  if (err) console.error(err);
};

/** INTERFACE **/
RadiatusTransportProvider.prototype.setup = function(name, channelId, continuation) {
  this.TRACE('setup', 'enter');
  this.isInitializing = true;
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
    this.TRACE('setup', 'channel bound' + channelId);
    this.peerChannel = channel;
    this.peerChannel.on('message', this._onPeerMessage.bind(this));
    this.peerChannel.send = function(msg) {
      this.TRACE('peerChannel.emit', JSON.stringify(msg));
      this.peerChannel.emit('message', msg);
    }.bind(this);
    this.peerChannel.emit('ready');
    this.peerChannel.send(JSON.stringify({cmd: 'ready'}));
  }.bind(this), function(err) {
    this.ERROR('setup', 'error binding channel '+channelId, err);
  }.bind(this));  
  
  this.conn = this.websocket(this.WS_URL);
  this.conn.on("onMessage", this._onServerMessage.bind(this, finishSetup));
  this.conn.on("onError", function (continuation, error) {
    this.conn = null;
    this.ERROR('conn.on', 'onError event fired', error);
    continuation(undefined, this._createError('UNKNOWN'));
  }.bind(this, continuation));
  this.conn.on("onClose", function (msg) {
    this.TRACE('conn.onClose', 'event');
    this.dispatchEvent('onClose', {});
    this.conn = null;
  }.bind(this));

};

RadiatusTransportProvider.prototype.send = function(tag, data, continuation) {
  this.TRACE('send', 'tag='+tag);
  if (this.conn === null) {
    continuation(undefined, this._createError('OFFLINE'));
  } 

  var id = Math.random()+'';
  var hash = this.cachedBuffer.add(data, id);
  this.TRACE('send', 'hash='+hash);
  var req = {
    id: id,
    cmd: 'send',
    tag: tag,
    hash: hash
  };

  if (this.isInitializing === true) {
    this.queuedRequests.push({ text: JSON.stringify(req) });
  } else {
    this.conn.send({ text: JSON.stringify(req) });
  }

  req.continuation = continuation;
  this.liveRequests[id] = req;
};

RadiatusTransportProvider.prototype.close = function(continuation) {
  this.TRACE('close', 'enter');
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
  this.TRACE('_onPeerMessage', msg);
  try {
    var parsedMsg = JSON.parse(msg);
    if (parsedMsg.cmd == 'ready') {
      //Ignore for now
      this.TRACE('_onPeerMessage', 'ready');
    // If my own send request, then treat this as an ACK
    } else if (this.liveRequests.hasOwnProperty(parsedMsg.id)) {  
      this.TRACE('_onPeerMessage', 'got ack for id='+parsedMsg.id);
      this.liveRequests[parsedMsg.id].continuation(null);
      delete this.liveRequests[parsedMsg.id];
    // Peer is trying to send me something, get it from the server
    } else {
      this.TRACE('_onPeerMessage', 'requesting buffer from server '+parsedMsg.hash);
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
    this.ERROR('_onPeerMessage', 'error handling message', e);
  }
};

RadiatusTransportProvider.prototype._onServerMessage = function(finishSetup, msg) {
  this.TRACE('_onServerMessage', JSON.stringify(msg));
  // Cache binary objects
  if (msg.buffer) {
    this.TRACE('_onMessage', 'caching ArrayBuffer');
    this.cachedBuffer.add(msg.buffer);
    return;
  } else if (msg.binary) {
    this.TRACE('_onServerMessage', 'caching Blob');
    this.cachedBuffer.addBlob(msg.binary);
    return;
  }

  // Process strings
  try {
    var parsedMsg = JSON.parse(msg.text);
    var id = parsedMsg.id;
    if (parsedMsg.cmd == 'ready') {
      this.TRACE('_onServerMessage', 'ready');
      this.isInitializing = false;
      // Call the setup() continuation
      finishSetup.finish(null);
      // Flush queued of requests
      while(this.queuedRequests.length > 0) {
        this.conn.send(this.queuedRequests.shift());
      }
      return;
    // Returned an error
    } else if (typeof parsedMsg.err !== 'undefined') {
      this.ERROR('send', 'returns error - '+parsedMsg.err);
      this.liveRequests[id].continuation(undefined, this._createError(parsedMsg.err));
      delete this.liveRequests[id];
    // Successfully stored buffer on server. Now inform peer
    } else if (parsedMsg.cmd == 'send' && parsedMsg.bufferSetDone === true) {
      this.TRACE('_onServerMessage', 'buffer is cached on server, tell peer to D/L');
      this.peerChannel.send(JSON.stringify(this.liveRequests[id]));
    // The server needs us to send the buffer
    } else if (parsedMsg.cmd == 'send' && parsedMsg.needBufferFromClient === true) {
      this.TRACE('_onServerMessage', 'sending buffer to server '+parsedMsg.hash);
      var buf = this.cachedBuffer.retrieve(parsedMsg.hash, parsedMsg.id);
      if (buf !== null) {
        this.conn.send({ buffer: buf });
      } else {
        this.ERROR('_onServerMessage', 'missing buffer '+parsedMsg.hash);
      }
    // Receiving a buffer from the server
    } else if (parsedMsg.cmd === 'receive' && parsedMsg.bufferSent === true) {
      this.TRACE('_onServerMessage', 'receive returns buffer with hash='+parsedMsg.hash);
      this.peerChannel.send(JSON.stringify(parsedMsg.senderReq));
      this.dispatchEvent('onData', {
        tag: parsedMsg.tag,
        data: this.cachedBuffer.retrieve(parsedMsg.hash)
      });
    } else {
      this.ERROR('_onServerMessage', 'unrecognized message '+msg.text);
    }
  } catch (e) {
    this.ERROR('_onServerMessage', 'error handling '+msg.text, e);
  }
};

/** REGISTER PROVIDER **/
if (typeof freedom !== 'undefined' &&
    typeof freedom.transport !== 'undefined') {
  freedom.transport().provideAsynchronous(RadiatusTransportProvider);
}

