var SparkMD5 = require('./providers/lib/spark-md5.min');
var bufferConverter = require('./lib/buffer');
var CachedBuffer = require('./models/cachedbuffer');
var config = require('config');

/**
 * Class for storing the state of a single
 * call (e.g. transport.send) that may span
 * multiple roundtrips
 **/

function ConnectionHandler(appid, username, ws) {
  this.appid = appid;
  this.username = username;
  this.websocket = ws;
  this.logger = require('./lib/logger')(appid);
  this.binaryCallbacks = {};
  
  this.initialize();
}

ConnectionHandler.prototype.initialize = function() {
};

ConnectionHandler.prototype.binaryCallback = function(hash, cb) {
  this.binaryCallbacks[hash] = cb;
};

/**
 * Handle binary objects from a WebSocket
 */
ConnectionHandler.prototype.handleBinary = function(msg, expires) {
  this.logger.trace('_handleBinary: enter');
  
  // Hash the buffer myself (SparkMD5 only works with ArrayBuffers)
  var spark = new SparkMD5.ArrayBuffer();
  spark.append(bufferConverter.toArrayBuffer(msg));
  var hash = spark.end();
  this.logger.debug('_handleBinary: hash='+hash);
  if (!this.binaryCallbacks.hasOwnProperty(hash)) {
    this.logger.warn('_handleBinary: no callbacks registered for ' + hash);
    return;
  }
  var callback = this.binaryCallbacks[hash];
  delete this.binaryCallbacks[hash];

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
  
  this.logger.trace('_handleBinary: exit');
};

module.exports = ConnectionHandler;