/**
 * Helper functions to convert between node.js Buffers and ArrayBuffers
 **/
module.exports = {
  toArrayBuffer: function(buffer) {
    "use strict";
    var ab = new ArrayBuffer(buffer.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
      view[i] = buffer[i];
    }
    return ab;
  },
  toBuffer: function(ab) {
    "use strict";
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
      buffer[i] = view[i];
    }
    return buffer;
  }
};
