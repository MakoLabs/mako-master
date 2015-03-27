
(function() {
  var assert, util;

  assert = require('assert');

  util = require('../lib/util');

  describe('util', function() {
    it('should return the same hash for the same object', function(done) {
      var obj1, obj2;
      obj1 = {
        oh: 'hai'
      };
      obj2 = {
        oh: 'hai'
      };
      assert.equal(util.hashObj(obj1), util.hashObj(obj2));
      return done();
    });
    it('should return a different hash for different objects', function(done) {
      var obj1, obj2;
      obj1 = {
        oh: 'hai'
      };
      obj2 = {
        oh: 'noes!'
      };
      assert.notEqual(util.hashObj(obj1), util.hashObj(obj2));
      return done();
    });
    return it('should return an error object for an unJSON.stringifiable object', function(done) {
      var Circ, obj;
      Circ = function() {
        return this.circ = this;
      };
      obj = new Circ;
      assert.deepEqual(util.hashObj(obj), new Error("TypeError: Converting circular structure to JSON"));
      return done();
    });
  });

}).call(this);
