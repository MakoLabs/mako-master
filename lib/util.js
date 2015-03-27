
(function() {
  var crypto;

  crypto = require('crypto');

  module.exports = {
    hashObj: function(obj) {
      var e, md5sum, str;
      md5sum = crypto.createHash('md5');
      try {
        str = JSON.stringify(obj);
      } catch (_error) {
        e = _error;
        return e;
      }
      md5sum.update(str);
      return md5sum.digest('hex');
    },
    apiVersion: '1'
  };

}).call(this);
