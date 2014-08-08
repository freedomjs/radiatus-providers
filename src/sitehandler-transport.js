/**
 * Site Handler for Transport
 **/
function TransportSiteHandler(logger) {
  this.logger = logger;
  this.clients = {};      //Store active clients
}

/**
 * Add a new WebSocket client
 * Set the appropriate listeners on the WebSocket
 **/
TransportSiteHandler.prototype.addConnection = function(username, ws) {
  this.logger.trace('addConnection: enter');
  this.logger.debug('addConnection: for username=' + username);

  // Store new client
  this.clients[username] = ws;
  ws.on('message', this._onMessage.bind(this, username));
  ws.on('close', this._onClose.bind(this, username));
  
  this.logger.trace('addConnection: exit');
};

/**
 * Handler for incoming message on a WebSocket connection
 **/
TransportSiteHandler.prototype._onMessage = function(username, msg) {
  this.logger.trace('_onMessage: enter');
  this.logger.debug('_onMessage: message from '+username);
  try {
    var parsedMsg = JSON.parse(msg);

  } catch (e) {
    this.logger.error('_onMessage: Failed processing message');
    this.logger.error(e);
  }

  this.logger.trace('_onMessage: exit');
};

/**
 * Handler for 'close' event from a WebSocket
 **/
TransportSiteHandler.prototype._onClose = function(username) {
  this.logger.trace('_onClose: enter');
  this.logger.debug('_onClose: '+username+' closed connection');
  delete this.clients[username];
  this.logger.trace('_onClose: exit');
};

module.exports = TransportSiteHandler;
