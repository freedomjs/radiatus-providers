var getLogger = require('../lib/logger');

/**
 * Site Handler for Social
 * - This creates a single global buddylist for 
 *   all active WebSocket connections
 **/
function GlobalSocialSiteHandler(appid) {
  "use strict";
  this.appid = appid;
  this.logger = getLogger(appid);
  this.clients = {};    //Store active connections
}

/**
 * Add a new WebSocket client to the global buddylist
 * Set the appropriate listeners on the WebSocket
 **/
GlobalSocialSiteHandler.prototype.addConnection = function(username, ws) {
  "use strict";
  this.logger.debug(username+'.addConnection: enter');

  // Store new client
  this.clients[username] = ws;

  ws.on('message', this._onMessage.bind(this, username));
  ws.on('close', this._onClose.bind(this, username));
  // Send back the global buddy list
  ws.send(JSON.stringify({
    'cmd': "state",
    'userId': username,
    'roster': this.getAllUsers()
  }));
  // Inform others of the new guy
  this.broadcastStatus(username, true);

  this.logger.trace(username+'.addConnection: exit');
};

/**
 * Retrieve an array of all active users
 **/
GlobalSocialSiteHandler.prototype.getAllUsers = function() {
  "use strict";
  this.logger.trace('getAllUsers: enter');
  var ret = [];
  for (var k in this.clients) {
    if (this.clients.hasOwnProperty(k)) {
      ret.push(k);
    }
  }
  this.logger.debug('getAllUsers: returns ' + JSON.stringify(ret));
  this.logger.trace('getAllUsers: exit');
  return ret;
};

/**
 * Send a message to all users, informing them that the target
 * user is now online/offline
 **/ 
GlobalSocialSiteHandler.prototype.broadcastStatus = function(username, online) {
  "use strict";
  this.logger.trace('broadcastStatus: enter');
  this.logger.debug('broadcastStatus: '+username+' online='+online);
  for (var k in this.clients) {
    if (this.clients.hasOwnProperty(k)) {
      try {
        this.clients[k].send(JSON.stringify({
          'cmd': 'roster',
          'userId': username,
          'online': online
        }));
      } catch (e) {
        this.logger.warn('broadcastStatus: failed to send message to ' + k);
        this.logger.warn(e);
      }
    }
  }
  this.logger.trace('broadcastStatus: exit');
};

/**
 * Handler for incoming message on a WebSocket connection
 **/
GlobalSocialSiteHandler.prototype._onMessage = function(username, msg) {
  "use strict";
  this.logger.debug(username+'._onMessage: enter');
  try {
    var parsedMsg = JSON.parse(msg);
    if (!parsedMsg.hasOwnProperty("cmd")) {
      this.logger.warn(username+"._onMessage: malformed message: "+msg);
    } else if (parsedMsg.cmd === "ping") {
      this.clients[username].send(JSON.stringify({ cmd: "pong" }));
    } else if (parsedMsg.cmd === "send") {
      if (this.clients.hasOwnProperty(parsedMsg.to)) {
        this.clients[parsedMsg.to].send(JSON.stringify({
          'cmd': 'message',
          'from': username,
          'msg': parsedMsg.msg
        }));
        this.logger.debug(username+'._onMessage: message forwarded to ' + parsedMsg.to);
      } else {
        this.logger.error(username+'._onMessage: message not sent, no connection to ' + parsedMsg.to);
      }
    }
  } catch (e) {
    this.logger.error(username+'._onMessage: failed handling message: '+msg);
    this.logger.error(e);
  }

  this.logger.trace(username+'._onMessage: exit');
};

/**
 * Handler for 'close' event from a WebSocket
 **/
GlobalSocialSiteHandler.prototype._onClose = function(username) {
  "use strict";
  this.logger.debug(username+'._onClose: enter');
  delete this.clients[username];
  this.broadcastStatus(username, false);
  this.logger.trace('_onClose: exit');
};

module.exports = GlobalSocialSiteHandler;
