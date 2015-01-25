var SparkMD5 = require('spark-md5');
var config = require('config');
var CachedBuffer = require('../models/cachedbuffer');
var BufferUtil = require("../lib/bufferutil");

var counter = 0;
/**
 * Class for storing the state of a single
 * call (e.g. transport.send) that may span
 * multiple roundtrips
 **/

function ConnectionHandler(appid, username, ws) {
  "use strict";
  this.appid = appid;
  this.username = username;
  this.num = counter++;
  this.websocket = ws;
  this.logger = require('./lib/logger')(appid);
  this.binaryCallbacks = {};
  
  this.initialize();
}

ConnectionHandler.prototype.initialize = function() {
  "use strict";
};

ConnectionHandler.prototype.id = function() {
  "use strict";
  return this.username + '[' + this.num + ']';
};

ConnectionHandler.prototype.binaryCallback = function(hash, cb) {
  "use strict";
  this.binaryCallbacks[hash] = cb;
};

/**
 * Handle binary objects from a WebSocket
 */
ConnectionHandler.prototype.handleBinary = function(msg, expires) {
  "use strict";
  this.logger.trace(this.id()+'._handleBinary: enter');
  
  // Hash the buffer myself (SparkMD5 only works with ArrayBuffers)
  var spark = new SparkMD5.ArrayBuffer();
  spark.append(BufferUtil.toArrayBuffer(msg));
  var hash = spark.end();
  if (!this.binaryCallbacks.hasOwnProperty(hash)) {
    this.logger.warn(this.id()+'._handleBinary: no callbacks registered for ' + hash);
    return;
  }
  var callback = this.binaryCallbacks[hash];
  delete this.binaryCallbacks[hash];

  this.logger.debug(this.id()+'._handleBinary: saving binary with hash='+hash);
  // Create a new record
  var newRecord = new CachedBuffer({
    key: hash,
    value: msg,
    created: new Date(),
    lastAccessed: new Date()
  });
  if (expires) {
    newRecord.expires = new Date((new Date().getTime()) + config.get('database.transportTTL'));
  }
  // Save the buffer
  newRecord.save(callback);
  
  this.logger.trace(this.id()+'._handleBinary: exit');
};

module.exports = ConnectionHandler;
