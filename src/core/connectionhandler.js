var SparkMD5 = require('spark-md5');
var CachedBuffer = require('../models/cachedbuffer');
var config = require('config');

var counter = 0;
/**
 * Class for storing the state of a single
 * call (e.g. transport.send) that may span
 * multiple roundtrips
 **/

function ConnectionHandler(appid, username, ws) {
  this.appid = appid;
  this.username = username;
  this.num = counter++;
  this.websocket = ws;
  this.logger = require('./lib/logger')(appid);
  this.binaryCallbacks = {};
  
  this.initialize();
}

ConnectionHandler.prototype.initialize = function() {
};

ConnectionHandler.prototype.id = function() {
  return this.username + '[' + this.num + ']';
};

ConnectionHandler.prototype.binaryCallback = function(hash, cb) {
  this.binaryCallbacks[hash] = cb;
};

/**
 * Handle binary objects from a WebSocket
 */
ConnectionHandler.prototype.handleBinary = function(msg, expires) {
  this.logger.trace(this.id()+'._handleBinary: enter');
  
  // Hash the buffer myself (SparkMD5 only works with ArrayBuffers)
  var spark = new SparkMD5.ArrayBuffer();
  spark.append(toArrayBuffer(msg));
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

/**
 * Helper functions to convert between node.js Buffers and ArrayBuffers
 **/
function toArrayBuffer(buffer) {
  var ab = new ArrayBuffer(buffer.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return ab;
}
function toBuffer(ab) {
  var buffer = new Buffer(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i];
  }
  return buffer;
}

module.exports = ConnectionHandler;
