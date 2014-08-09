var mongoose = require('mongoose');

var cachedBufferSchema = mongoose.Schema({
  key: { type: String, required: true, unique: true},
  value: Buffer,
  timestamp: Date,
  expires: Date
});

// Password verification
cachedBufferSchema.methods.comparePassword = function(candidatePassword, cb) {
	bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
		if(err) return cb(err);
		cb(null, isMatch);
	});
};

module.exports = mongoose.model('CachedBuffer', cachedBufferSchema);
