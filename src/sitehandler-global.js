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
      this.clients[k].send({
        'cmd': 'roster',
        'userId': username,
        'online': online
      });
    }
  }
};

GlobalSiteHandler.prototype.addConnection = function(username, ws) {
  console.log(username + ': opened connection');
  this.clients[username] = ws;

  ws.on('message', function(myUsername, msg) {
    console.log('!!!');
    console.log('received: %s', msg);
  }.bind(this, username));
  ws.on('close', function(myUsername) {
    console.log(myUsername + ': closed connection');
    delete this.clients[myUsername];
    this.broadcastStatus(myUsername, false);
  }.bind(this, username));
  
  // Send back the global buddy list
  ws.send({
    'cmd': "state",
    'userId': username,
    'roster': this.getAllUsers()
  });
  //Inform others of the new guy
  this.broadcastStatus(username, true);
};

module.exports = GlobalSiteHandler;
