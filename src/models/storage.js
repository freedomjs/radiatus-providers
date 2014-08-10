var mongoose = require('mongoose');

var storageSchema = mongoose.Schema({
  // Owner of the document
  username: { type: String, required: true },
  // Key
  key: { type: String, required: true },
  // Is this the value or the hash of the value?
  // If hash, need to retrieve actual content from
  // CachedBuffer collection
  valueIsHash: Boolean,
  // Value
  value: String,
  // Time the document was last updated
  lastUpdated: Date,
  // Time the document was last accessed
  lastAccessed: Date
});

/**
storageSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});
**/

/**
// Password verification
storageSchema.methods.comparePassword = function(candidatePassword, cb) {
	bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
		if(err) return cb(err);
		cb(null, isMatch);
	});
};
**/

module.exports = mongoose.model('Storage', storageSchema);
