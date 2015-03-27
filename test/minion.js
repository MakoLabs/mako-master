
(function() {
  var assert, Minion, http, model, request, server;

  assert = require('assert');

  request = require('request');

  http = require('http');

  Minion = require('../lib/minion');

  model = require('../lib/model');

  server = http.createServer();

  describe("minion", function() {
    beforeEach(function(done) {
      server.listen(3000);
      model.minions['minion-us'] = {
        ip: '127.0.0.1'
      };
      return done();
    });
    afterEach(function(done) {
      server.removeAllListeners("request");
      server.close();
      return done();
    });
    it("should send the correct auth headers", function(done) {
      server.on('request', function(req, res) {
        var authArray;
        authArray = new Buffer(req.headers.authorization.split(' ')[1], 'base64').toString('ascii').split(':');
        res.end();
        assert.equal(authArray[0], "master");
        assert.equal(authArray[1], "shortfin");
        return done();
      });
      return Minion.spawn('minion-us', {}, function(err, procs) {
        return assert.equal(err, null);
      });
    });
    it("should pass a spawn command to a minion", function(done) {
      server.on("request", function(req, res) {
        return req.on("data", function(buf) {
          assert.deepEqual(JSON.parse(buf.toString()), {
            test: "testing"
          });
          return res.end();
        });
      });
      return Minion.spawn('minion-us', {
        test: "testing"
      }, function(err, procs) {
        assert.equal(err, null);
        return done();
      });
    });
    it("should pass back the procs object", function(done) {
      server.on("request", function(req, res) {
        return res.end(JSON.stringify({
          somePID: {
            id: "somePID",
            status: "running"
          }
        }));
      });
      return Minion.spawn('minion-us', {
        test: "testing"
      }, function(err, procs) {
        assert.equal(err, null);
        assert.deepEqual(procs, {
          somePID: {
            id: "somePID",
            status: "running"
          }
        });
        return done();
      });
    });
    return it("should fetch a ps object", function(done) {
      server.on("request", function(req, res) {
        return res.end(JSON.stringify({
          someID: {
            id: 'someID',
            status: 'running',
            repo: 'reponame',
            commit: 'commitid',
            cwd: '/dev/null',
            drone: 'testDrone'
          }
        }));
      });
      return Minion.ps('minion-us', function(err, procs) {
        return done(assert.deepEqual(procs, {
          someID: {
            id: 'someID',
            status: 'running',
            repo: 'reponame',
            commit: 'commitid',
            cwd: '/dev/null',
            drone: 'testDrone'
          }
        }));
      });
    });
  });

}).call(this);
