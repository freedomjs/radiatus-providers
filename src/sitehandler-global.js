function GlobalSiteHandler() {
  this.clients = {};
}

GlobalSiteHandler.prototype.getAllUsers = function() {
  var ret = [];
  for (var k in this.clients) {
    if (this.clients.hasOwnProperty(k)) {
      ret.push(k);
    }
  }
  return ret;
};

GlobalSiteHandler.prototype.broadcastStatus = function(username, online) {
  for (var k in this.clients) {
    if (this.clients.hasOwnProperty(k)) {
      this.clients[k].send(JSON.stringify({
        'cmd': 'roster',
        'userId': username,
        'online': online
      }));
    }
  }
};

GlobalSiteHandler.prototype.addConnection = function(username, ws) {
  console.log(username + ': opened connection');
  this.clients[username] = ws;

  ws.on('message', function(myUsername, msg) {
    try {
      var parsedMsg = JSON.parse(msg);
      if (this.clients.hasOwnProperty(parsedMsg.to)) {
        this.clients[parsedMsg.to].send(JSON.stringify({
          'cmd': 'message',
          'from': myUsername,
          'msg': parsedMsg.msg
        }));
      } else {
        console.error('Failure sending message to ' + parsedMsg.to);
      }
    } catch (e) {
      console.error(e);
    }
  }.bind(this, username));
  ws.on('close', function(myUsername) {
    console.log(myUsername + ': closed connection');
    delete this.clients[myUsername];
    this.broadcastStatus(myUsername, false);
  }.bind(this, username));
  
  // Send back the global buddy list
  ws.send(JSON.stringify({
    'cmd': "state",
    'userId': username,
    'roster': this.getAllUsers()
  }));
  //Inform others of the new guy
  this.broadcastStatus(username, true);
};

module.exports = GlobalSiteHandler;
