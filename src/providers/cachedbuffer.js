/*globals SparkMD5 */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Keeps track of ArrayBuffers across calls to the
 * storage/transport interfaces.
 **/

function CachedBuffer() {
  this.cache = {};    // H(buffer) -> { ids: [], buffer: ArrayBuffer}
  
  if (typeof SparkMD5 == 'undefined') {
    console.error("CachedBuffer: Missing SparkMD5");
  }
}

/**
 * Adds an ArrayBuffer to the cache, returning its MD5 hash
 * If an id is passed in, it's added to a ref counter
 **/
CachedBuffer.prototype.add = function(buffer, id) {
  var spark = new SparkMD5.ArrayBuffer();
  spark.append(buffer);
  var hash = spark.end();
  if(!this.cache.hasOwnProperty(hash)) {
    this.cache[hash] = {
      ids: [],
      buffer: buffer
    };
  }
  if (typeof id !== 'undefined') {
    this.cache[hash].ids.push(id);
  }
  console.log('CachedBuffer.add: '+hash);
  return hash;
};

/**
 * Retrieves a buffer given its hash
 * If an id is passed in, that ref is removed
 *  and no refs are left, the buffer is purged from memory
 **/
CachedBuffer.prototype.retrieve = function(hash, id) {
  if (!this.cache.hasOwnProperty(hash)) {
    console.error("CachedBuffer.retrieve: no content with hash "+hash);
    return;
  }

  if (typeof id !== 'undefined') {
    //Remove id from ref count
    this.cache[hash].ids = this.cache[hash].ids.filter(function(id, elt) {
        return id !== elt;
    }.bind(this, id));
      
    // If ref count is 0, remove from cache
    if (this.cache[hash].ids.length <= 0) {
      delete this.cache[hash];
    }
  }
  console.log('CachedBuffer.retrieve: '+hash);
  return this.cache[hash].buffer;
};

