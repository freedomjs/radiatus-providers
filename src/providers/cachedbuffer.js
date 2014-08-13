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

/**
 * Clears the cache. Mostly used in testing
 **/
CachedBuffer.prototype.clear = function() {
  if (D) console.log('CachedBuffer.clear: enter');
  this.cache = {};
};

/**
 * Wraps the 'add' method, first converting the Blob
 * to an ArrayBuffer
 * NOTE: Does not return anything due to the async nature
 *  of FileReader
 **/ 
CachedBuffer.prototype.addBlob = function(blob, id) {
  var fr;
  if (D) console.log('CachedBuffer.addBlob: converting Blob to ArrayBuffer');
  if (typeof FileReaderSync !== 'undefined') {
    fr = new FileReaderSync();
    this.cachedBuffer.add(fr.readAsArrayBuffer(blob), id);
  } else if (typeof FileReader !== 'undefined') {
    fr = new FileReader();
    fr.onload = function(id, e) {
      this.add(e.target.result, id);
    }.bind(this, id);
    fr.readAsArrayBuffer(blob);
  } else {
    console.error('CachedBuffer.addBlob: no idea how to read Blob');
  }
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
      ids: [],            // List of request id's that need this
      otherRefCount: 0,   // Generic counter of other references
      buffer: buffer      // Buffer value
    };
  }
  if (typeof id !== 'undefined') {
    this.cache[hash].ids.push(id);
  } else {
    this.cache[hash].otherRefCount += 1;
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
  } else {
    this.cache[hash].otherRefCount -= 1;
  }

  // If ref count is 0, remove from cache
  if (this.cache[hash].ids.length <= 0 &&
      this.cache[hash].otherRefCount <= 0) {
    if (D) console.log('CachedBuffer.retrieve: deleting item');
    delete this.cache[hash];
  }

  if (D) console.log('CachedBuffer.retrieve: returning '+hash);
  return retValue;
};

