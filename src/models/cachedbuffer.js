var mongoose = require('mongoose');
var config = require('config');

var cachedBufferSchema = mongoose.Schema({
  // This should be the MD5 hash of the value
  key: { type: String, required: true, unique: true},
  // Valued being stored
  value: Buffer,
  // Time the record was created
  created: Date,
  // Currently, any buffers stored through storebuffer are permanent
  // This only applies to buffers sent over transport
  expires: Date,
  // Last time this value was accessed
  lastAccessed: Date
});

cachedBufferSchema.methods.setExpiry = function() {
  var now = new Date().getTime();
  this.expires = new Date(now + config.get('database.transportTTL'));
};

/**
// Password verification
cachedBufferSchema.methods.comparePassword = function(candidatePassword, cb) {
	bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
		if(err) return cb(err);
		cb(null, isMatch);
	});
};
**/
module.exports = mongoose.model('CachedBuffer', cachedBufferSchema);
