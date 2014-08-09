var mongoose = require('mongoose');

var storageSchema = mongoose.Schema({
  username: { type: String, required: true },
  key: { type: String, required: true },
  valueIsRef: Boolean,
  value: String
});

// Password verification
storageSchema.methods.comparePassword = function(candidatePassword, cb) {
	bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
		if(err) return cb(err);
		cb(null, isMatch);
	});
};

module.exports = mongoose.model('Storage', storageSchema);
