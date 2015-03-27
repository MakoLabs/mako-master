
(function() {
  var assert, fs, gitter, http, model, rimraf, server, spawn, webserver;

  process.env.HOSTNAME = "localhost";

  assert = require('assert');

  http = require('http');

  spawn = require('child_process').spawn;

  webserver = require('../lib/webserver');

  gitter = require('../lib/gitter');

  model = require('../lib/model');

  rimraf = require('rimraf');

  fs = require('fs');

  server = http.createServer();

  describe("gitter", function() {
    this.timeout(6000);
    before(function(done) {
      server.listen(3000);
      return webserver.listen(7000, function() {
        return done();
      });
    });
    after(function(done) {
      server.removeAllListeners("request");
      server.close();
      return webserver.close(function() {
        return done();
      });
    });
    it('should accept a git push', function(done) {
      var push, rand;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      push = spawn('git', ['push', "http://test:shortfin@localhost:7000/" + rand, 'master']);
      push.stderr.on('data', function(buf) {});
      push.stdout.on('data', function(buf) {});
      return gitter.repos.once('push', function() {
        return setTimeout(function() {
          assert(fs.existsSync("./repos/" + rand + ".git"));
          push.kill();
          return rimraf("./repos/" + rand + ".git", function() {
            return done();
          });
        }, 500);
      });
    });
    it('should update the latest commit in the model', function(done) {
      var push, rand, shaChecker;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      push = spawn('git', ['push', "http://test:shortfin@localhost:7000/" + rand, 'master']);
      shaChecker = spawn('git', ['log', 'master', '-n', '1']);
      return shaChecker.stdout.on('data', function(buf) {
        var targetSha;
        targetSha = buf.toString().split('\n')[0].split(' ')[1];
        return gitter.repos.once('push', function() {
          return model.latestCommits.get(rand, function(err, sha) {
            assert.equal(sha, targetSha);
            return done();
          });
        });
      });
    });
    it('should update the previous commit in the model', function(done) {
      var push, rand, shaChecker;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.manifest = {};
      model.manifest[rand] = {
        opts: {
          commit: 'totallyold'
        }
      };
      push = spawn('git', ['push', "http://test:shortfin@localhost:7000/" + rand, 'master']);
      shaChecker = spawn('git', ['log', 'master', '-n', '1']);
      return shaChecker.stdout.on('data', function(buf) {
        var targetSha;
        targetSha = buf.toString().split('\n')[0].split(' ')[1];
        return gitter.repos.once('push', function() {
          return model.prevCommits.get(rand, function(err, prevCommit) {
            assert.deepEqual(err, null);
            assert.equal(prevCommit, 'totallyold');
            return model.latestCommits.get(rand, function(err, sha) {
              assert.equal(sha, targetSha);
              return done();
            });
          });
        });
      });
    });
    return it('should tell all drones to fetch', function(done) {
      var push, rand;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions['fetchtest'] = {
        ip: '127.0.0.1'
      };
      server.once("request", function(req, res) {
        return req.once("data", function(buf) {
          var parsed;
          parsed = JSON.parse(buf.toString());
          assert.equal(parsed.name, rand);
          assert.equal(parsed.url, "http://git:shortfin@localhost:4001/" + rand);
          res.end();
          return setTimeout(function() {
            return rimraf("./repos/" + rand + ".git", function() {
              return done();
            });
          }, 1000);
        });
      });
      return push = spawn('git', ['push', "http://test:shortfin@localhost:7000/" + rand, 'master']);
    });
  });

}).call(this);
