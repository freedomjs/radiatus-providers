/*globals SparkMD5 */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */

/**
 * Keeps track of ArrayBuffers across calls to the
 * storage/transport interfaces.
 **/

var D;
function CachedBuffer() {
  this.cache = {};    // H(buffer) -> { ids: [], buffer: ArrayBuffer}
  
  if (typeof SparkMD5 == 'undefined') {
    console.error("CachedBuffer: Missing SparkMD5");
  }
}

CachedBuffer.prototype.clear = function() {
  if (D) console.log('CachedBuffer.clear: enter');
  this.cache = {};
};

/**
 * Adds an ArrayBuffer to the cache, returning its MD5 hash
 * If an id is passed in, it's added to a ref counter
 **/
CachedBuffer.prototype.add = function(buffer, id) {
  if (D) console.log('CachedBuffer.add: enter, id='+id);
  var spark = new SparkMD5.ArrayBuffer();
  spark.append(buffer);
  var hash = spark.end();
  if (D) console.log('CachedBuffer.add: hash='+hash);
  if(!this.cache.hasOwnProperty(hash)) {
    this.cache[hash] = {
      ids: [],
      buffer: buffer
    };
  }
  if (typeof id !== 'undefined') {
    this.cache[hash].ids.push(id);
  }
  if (D) console.log('CachedBuffer.add: references='+JSON.stringify(this.cache[hash].ids));
  return hash;
};

/**
 * Retrieves a buffer given its hash
 * If an id is passed in, that ref is removed
 *  and no refs are left, the buffer is purged from memory
 **/
CachedBuffer.prototype.retrieve = function(hash, id) {
  if (D) console.log('CachedBuffer.retrieve: hash='+hash+',id='+id);
  var retValue;
  if (!this.cache.hasOwnProperty(hash)) {
    console.error("CachedBuffer.retrieve: no content with hash "+hash);
    return null;
  }
  retValue = this.cache[hash].buffer;

  if (typeof id !== 'undefined') {
    //Remove id from ref count
    this.cache[hash].ids = this.cache[hash].ids.filter(function(id, elt) {
      return id !== elt;
    }.bind(this, id));
      
    // If ref count is 0, remove from cache
    if (this.cache[hash].ids.length <= 0) {
      if (D) console.log('CachedBuffer.retrieve: deleting item');
      delete this.cache[hash];
    }
  }
  if (D) console.log('CachedBuffer.retrieve: returning '+hash);
  return retValue;
};

