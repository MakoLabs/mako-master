
(function() {
  var assert, fs, manifesto, mkdirp, rand, rimraf, test1, test2, testFolder;

  manifesto = require('../lib/manifesto');

  fs = require('fs');

  rimraf = require('rimraf');

  mkdirp = require('mkdirp');

  assert = require('assert');

  rand = Math.floor(Math.random() * (1 << 24)).toString(16);

  testFolder = "./" + rand;

  test1 = {
    test1: {
      instances: '1',
      load: 1,
      routing: {
        domain: 'example.com'
      },
      opts: {
        setup: ['npm', 'install', '--production'],
        command: ['node', 'index.js'],
        commit: 'LATEST',
        env: {
          PORT: 'RANDOM_PORT'
        }
      }
    }
  };

  test2 = JSON.parse(JSON.stringify(test1));

  test2.test2 = test2.test1;

  delete test2.test1;

  test2.test2.routing.domain = '2.example.com';

  describe('manifesto', function() {
    beforeEach(function() {
      mkdirp.sync(testFolder);
      fs.writeFileSync("" + testFolder + "/test1.json", JSON.stringify(test1));
      fs.writeFileSync("" + testFolder + "/test2.json", JSON.stringify(test2));
      return manifesto.manifestDir = testFolder;
    });
    afterEach(function() {
      return rimraf.sync(testFolder);
    });
    it('should return all the manifests by file', function(done) {
      var expected;
      expected = [
        {
          file: 'test1.json',
          manifest: test1
        }, {
          file: 'test2.json',
          manifest: test2
        }
      ];
      return manifesto.manifests(function(err, manifests) {
        return done(assert.deepEqual(manifests, expected));
      });
    });
    it('should allow you to overwrite a manifest', function(done) {
      var new_test1;
      new_test1 = JSON.parse(JSON.stringify(test1));
      new_test1.load = 5;
      return manifesto.write({
        file: 'test1.json',
        manifest: new_test1
      }, function(err) {
        assert.equal(err, null);
        return manifesto.manifests(function(err, manifests) {
          return done(assert.equal(manifests[0].manifest.load, 5));
        });
      });
    });
    it('should allow you to write a new manifest', function(done) {
      var new_manifest;
      new_manifest = JSON.parse(JSON.stringify(test1));
      new_manifest.domain = 'totallynew.example.com';
      return manifesto.write({
        file: 'totallynew.json',
        manifest: new_manifest
      }, function(err) {
        assert.equal(err, null);
        return manifesto.manifests(function(err, manifests) {
          assert.equal(manifests[2].file, 'totallynew.json');
          return done(assert.equal(manifests[2].manifest.domain, 'totallynew.example.com'));
        });
      });
    });
    it('should fail an invalid manifest', function() {
      var new_manifest;
      new_manifest = JSON.parse(JSON.stringify(test1));
      delete new_manifest.test1;
      assert.notEqual(null, manifesto.validate(new_manifest));
      new_manifest = JSON.parse(JSON.stringify(test1));
      delete new_manifest.test1.opts;
      assert.notEqual(null, manifesto.validate(new_manifest));
      new_manifest = JSON.parse(JSON.stringify(test1));
      delete new_manifest.test1.opts.commit;
      assert.notEqual(null, manifesto.validate(new_manifest));
      new_manifest = JSON.parse(JSON.stringify(test1));
      delete new_manifest.test1.instances;
      assert.notEqual(null, manifesto.validate(new_manifest));
      new_manifest = JSON.parse(JSON.stringify(test1));
      delete new_manifest.test1.routing;
      return assert.notEqual(null, manifesto.validate(new_manifest));
    });
    it('should pass a valid manifest', function() {
      var new_manifest;
      new_manifest = JSON.parse(JSON.stringify(test1));
      return assert.equal(null, manifesto.validate(new_manifest));
    });
    it('should pass multiple valid manifests', function() {
      var new_manifest;
      new_manifest = JSON.parse(JSON.stringify(test1));
      new_manifest.test2 = JSON.parse(JSON.stringify(new_manifest.test1));
      return assert.equal(null, manifesto.validate(new_manifest));
    });
    return it('should fail multiple manifests where one is invalid', function() {
      var new_manifest;
      new_manifest = JSON.parse(JSON.stringify(test1));
      new_manifest.test2 = JSON.parse(JSON.stringify(new_manifest.test1));
      delete new_manifest.test2.routing;
      return assert.notEqual(null, manifesto.validate(new_manifest));
    });
  });

}).call(this);
