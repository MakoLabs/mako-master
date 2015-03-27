
(function() {
  var assert, fs, http, levelup, model, rimraf, server, scheduler, util;

  assert = require('assert');

  levelup = require('level');

  rimraf = require('rimraf');

  scheduler = require('../lib/scheduler');

  model = require('../lib/model');

  util = require('../lib/util');

  fs = require('fs');

  http = require('http');

  server = http.createServer();

  describe("scheduler.getManifest", function() {
    before(function() {
      model.latestCommits = levelup('./test_commits.db');
      model.prevCommits = levelup('./test_prevCommits.db');
      return model.serviceInfo = levelup('./test_serviceInfo.db', {
        valueEncoding: 'json'
      });
    });
    beforeEach(function() {
      try {
        fs.mkdirSync('./manifest');
      } catch (_error) {}
      fs.writeFileSync('./manifest/test_1.json', JSON.stringify({
        name1: {
          instances: 7,
          opts: {
            commit: '1'
          }
        }
      }));
      return fs.writeFileSync('./manifest/test_2.json', JSON.stringify({
        name2: {
          instances: 3,
          opts: {
            commit: '1'
          }
        }
      }));
    });
    afterEach(function() {
      fs.unlinkSync('./manifest/test_1.json');
      fs.unlinkSync('./manifest/test_2.json');
      model.manifest = {};
      return model.minions = {};
    });
    after(function() {
      rimraf.sync('./test_commits.db');
      rimraf.sync('./test_prevCommits.db');
      return rimraf.sync('./test_serviceInfo.db');
    });
    it('should concatenate all json files in a dir into one manifest', function(done) {
      return scheduler.getManifest(function(err) {
        assert.equal(err, null);
        assert.equal(model.manifest.name1.instances, 7);
        assert.equal(model.manifest.name2.instances, 3);
        return done();
      });
    });
    it('should complain when something is duplicated', function(done) {
      fs.writeFileSync('./manifest/test_2dup.json', JSON.stringify({
        name2: {
          instances: 3,
          opts: {
            commit: '1'
          }
        }
      }));
      return scheduler.getManifest(function(err) {
        var error, _i, _len, _results;
        fs.unlinkSync('./manifest/test_2dup.json');
        _results = [];
        for (_i = 0, _len = err.length; _i < _len; _i++) {
          error = err[_i];
          if (error === "name2 is duplicated") {
            _results.push(done());
          } else {
            _results.push(void 0);
          }
        }
        return _results;
      });
    });
    it('should handle malformed JSON', function(done) {
      fs.writeFileSync('./manifest/test_malformed.json', "lol this totally isn't JSON");
      return scheduler.getManifest(function(err, manifest) {
        var error, _i, _len, _results;
        fs.unlinkSync('./manifest/test_malformed.json');
        _results = [];
        for (_i = 0, _len = err.length; _i < _len; _i++) {
          error = err[_i];
          if (error.file === "test_malformed.json") {
            if (error.error.type === "unexpected_token") {
              _results.push(done());
            } else {
              _results.push(void 0);
            }
          } else {
            _results.push(void 0);
          }
        }
        return _results;
      });
    });
    it('should prune jobs no longer in the manifest', function(done) {
      var manifest, rand1;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions[rand1] = {
        processes: {
          one: {
            status: 'running',
            commit: '1',
            repo: 'a'
          },
          two: {
            status: 'running',
            commit: '2',
            repo: 'a'
          }
        }
      };
      manifest = {
        a: {
          killable: true,
          opts: {
            commit: '2'
          }
        }
      };
      return model.serviceInfo.put('a', {
        healthyCommits: {
          '2': true
        }
      }, function() {
        return scheduler.checkStale(manifest, function() {
          return setTimeout(function() {
            assert(model.kill[rand1].one);
            clearTimeout(model.kill[rand1].one);
            model.kill = {};
            return done();
          }, 10);
        });
      });
    });
    it('should prune jobs once the next commit is healthy', function(done) {
      var manifest, rand1;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions[rand1] = {
        processes: {
          one: {
            status: 'running',
            commit: '1',
            repo: 'a'
          }
        }
      };
      manifest = {
        a: {
          killable: true,
          opts: {
            commit: '2'
          }
        }
      };
      return model.serviceInfo.put('a', {
        healthyCommits: {
          '2': true
        }
      }, function() {
        return scheduler.checkStale(manifest, function() {
          return setTimeout(function() {
            assert(model.kill[rand1].one);
            clearTimeout(model.kill[rand1].one);
            model.kill = {};
            return done();
          }, 10);
        });
      });
    });
    it('should not prune jobs if the next commit is not healthy', function(done) {
      var manifest, rand1;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions[rand1] = {
        processes: {
          one: {
            status: 'running',
            commit: '1',
            repo: 'a'
          }
        }
      };
      manifest = {
        a: {
          opts: {
            commit: '2'
          }
        }
      };
      return model.serviceInfo.put('a', {
        healthyCommits: {
          '1': true,
          '2': false
        }
      }, function() {
        return scheduler.checkStale(manifest, function() {
          assert(!model.kill || !model.kill[rand1]);
          model.kill = {};
          return done();
        });
      });
    });
    it('should not cut over routing while the new commit is not healthy', function(done) {
      var rand1;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions = {};
      model.minions[rand1] = {
        ip: 'example.com',
        processes: {
          pidone: {
            status: 'running',
            commit: '1',
            repo: 'a'
          },
          pidtwo: {
            status: 'running',
            commit: '2',
            repo: 'a'
          }
        }
      };
      model.portMap = {};
      model.portMap[rand1] = {
        pidone: {
          repo: 'a',
          port: 2014,
          commit: '1'
        }
      };
      model.manifest = {
        a: {
          instances: 2,
          killable: true,
          opts: {
            commit: '2'
          }
        }
      };
      return model.prevCommits.put('a', '1', function() {
        return model.serviceInfo.put('a', {
          healthyCommits: {
            '1': true
          }
        }, function() {
          return scheduler.calculateRoutingTable(function(err, routes) {
            assert.deepEqual(err, null);
            assert.deepEqual(routes, {
              a: {
                routes: [
                  {
                    host: 'example.com',
                    port: 2014
                  }
                ]
              }
            });
            return done();
          });
        });
      });
    });
    it('should rut over routing once the new commit is healthy', function(done) {
      var rand1;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions = {};
      model.minions[rand1] = {
        ip: 'example.com',
        processes: {
          pidone: {
            status: 'running',
            commit: '1',
            repo: 'a'
          },
          pidtwo: {
            status: 'running',
            commit: '2',
            repo: 'a'
          },
          pidthree: {
            status: 'running',
            commit: '2',
            repo: 'a'
          }
        }
      };
      model.portMap = {};
      model.portMap[rand1] = {
        pidone: {
          repo: 'a',
          port: 2014,
          commit: '1'
        },
        pidtwo: {
          repo: 'a',
          port: 2015,
          commit: '2'
        },
        pidthree: {
          repo: 'a',
          port: 2016,
          commit: '2'
        }
      };
      model.manifest = {
        a: {
          instances: 2,
          killable: true,
          opts: {
            commit: '2'
          }
        }
      };
      return model.prevCommits.put('a', '1', function() {
        return model.serviceInfo.put('a', {
          healthyCommits: {
            '2': true,
            '1': true
          }
        }, function() {
          return scheduler.calculateRoutingTable(function(err, routes) {
            assert.deepEqual(err, null);
            assert.deepEqual(routes, {
              a: {
                routes: [
                  {
                    host: 'example.com',
                    port: 2015
                  }, {
                    host: 'example.com',
                    port: 2016
                  }
                ]
              }
            });
            return done();
          });
        });
      });
    });
    it('should respect the kill ttl set in the options', function(done) {
      var manifest, rand1;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions[rand1] = {
        processes: {
          one: {
            status: 'running',
            commit: '1',
            repo: 'a'
          }
        }
      };
      manifest = {
        a: {
          killable: true,
          killTimeout: 1000,
          opts: {
            commit: '2'
          }
        }
      };
      return model.serviceInfo.put('a', {
        healthyCommits: {
          '2': true
        }
      }, function() {
        return scheduler.checkStale(manifest, function() {
          return setTimeout(function() {
            assert.equal(model.kill[rand1].one._idleTimeout, manifest.a.killTimeout);
            clearTimeout(model.kill[rand1].one);
            model.kill = {};
            return done();
          }, 10);
        });
      });
    });
    return it('should prune jobs no longer in the manifest - integration', function(done) {
      fs.writeFileSync('./manifest/test_2.json', JSON.stringify({
        name2: {
          instances: 3,
          killable: true,
          opts: {
            commit: '1'
          }
        }
      }));
      return model.serviceInfo.put('name2', {
        healthyCommits: {
          '2': true
        }
      }, function() {
        return scheduler.getManifest(function(errs) {
          var rand1;
          if (errs != null) {
            throw errs;
          }
          fs.writeFileSync('./manifest/test_2.json', JSON.stringify({
            name2: {
              instances: 3,
              killable: true,
              opts: {
                commit: '2'
              }
            }
          }));
          rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
          model.minions[rand1] = {
            processes: {
              one: {
                status: 'running',
                commit: '1',
                repo: 'name2'
              }
            }
          };
          return scheduler.getManifest(function(errs) {
            return setTimeout(function() {
              if (errs != null) {
                throw errs;
              }
              assert(model.kill[rand1].one);
              clearTimeout(model.kill[rand1].one);
              model.kill = {};
              return done();
            }, 10);
          });
        });
      });
    });
  });

  describe('prevCommit', function() {
    after(function() {
      fs.unlinkSync('./manifest/test_3.json');
      model.manifest = {};
      return model.minions = {};
    });
    return it('should update prevCommit', function(done) {
      fs.writeFileSync('./manifest/test_3.json', JSON.stringify({
        name3: {
          instances: 3,
          opts: {
            commit: 'old'
          }
        }
      }));
      return scheduler.getManifest(function(errs) {
        assert(!errs);
        fs.writeFileSync('./manifest/test_3.json', JSON.stringify({
          name3: {
            instances: 3,
            opts: {
              commit: 'new'
            }
          }
        }));
        return scheduler.getManifest(function(errs) {
          assert(!errs);
          return model.prevCommits.get('name3', function(err, prevCommit) {
            assert.deepEqual(err, null);
            assert.equal(prevCommit, 'old');
            return done();
          });
        });
      });
    });
  });

  describe("scheduler", function() {
    beforeEach(function() {
      model.minions = {};
      model.manifest = {};
      return server.listen(3000);
    });
    afterEach(function() {
      server.removeAllListeners("request");
      return server.close();
    });
    it('should ps all drones', function(done) {
      var rand1, rand2;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      rand2 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions[rand1] = {
        ip: '127.0.0.1'
      };
      model.minions[rand2] = {
        ip: '127.0.0.1'
      };
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
      return scheduler.ps(function(err, procs) {
        assert.equal(procs[rand1].someID.status, "running");
        assert.equal(procs[rand2].someID.status, "running");
        return done();
      });
    });
    it('should identify required processes', function(done) {
      var rand1, rand2;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      rand2 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions[rand1] = {
        spawnable: true,
        processes: {
          one: {
            status: 'running',
            commit: '1',
            repo: 'a'
          },
          two: {
            status: 'running',
            commit: '2',
            repo: 'b'
          }
        }
      };
      model.minions[rand2] = {
        spawnable: true,
        processes: {
          two: {
            status: 'running',
            commit: '2',
            repo: 'b'
          }
        }
      };
      model.manifest = {
        a: {
          instances: '*',
          opts: {
            commit: '1'
          }
        },
        b: {
          instances: 3,
          opts: {
            commit: '2'
          }
        }
      };
      return scheduler.buildRequired(function() {
        assert.deepEqual(model.manifest.a.required, [rand2]);
        assert.equal(model.manifest.b.delta, 1);
        return done();
      });
    });
    it('should mark a commit as healthy if it has been fully deployed', function(done) {
      var rand1, rand2;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      rand2 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.manifest[rand1] = {
        instances: '*',
        opts: {
          commit: '1'
        }
      };
      model.manifest[rand2] = {
        instances: 3,
        opts: {
          commit: '2'
        }
      };
      return scheduler.markHealthy(function() {
        return model.serviceInfo.get(rand1, function(err, info) {
          assert.deepEqual(err, null, 'star instances failed');
          assert(info.healthyCommits['1'], 'star instances failed');
          return model.serviceInfo.get(rand2, function(err, info) {
            assert.deepEqual(err, null, 'numbered instances failed');
            assert(info.healthyCommits['2'], 'numbered instances failed');
            return done();
          });
        });
      });
    });
    it('should not mark a commit as healthy if it has not been fully deployed', function(done) {
      var rand1, rand2;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      rand2 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.manifest[rand1] = {
        instances: '*',
        required: ['minion1']
      };
      model.manifest[rand2] = {
        instances: 3,
        delta: 1
      };
      return model.serviceInfo.put(rand1, {
        healthyCommits: {
          'foo': true
        }
      }, function() {
        return model.serviceInfo.put(rand2, {
          healthyCommits: {
            'foo': true
          }
        }, function() {
          return scheduler.markHealthy(function() {
            return model.serviceInfo.get(rand1, function(err, info) {
              assert.deepEqual(err, null);
              assert.deepEqual(info.healthyCommits['1'], void 0);
              return model.serviceInfo.get(rand2, function(err, info) {
                assert.deepEqual(err, null, 'numbered instances failed');
                assert.deepEqual(info.healthyCommits['2'], void 0);
                return done();
              });
            });
          });
        });
      });
    });
    it('should not include unspawnable minions in buildRequired', function(done) {
      var rand1, rand2;
      rand1 = Math.floor(Math.random() * (1 << 24)).toString(16);
      rand2 = Math.floor(Math.random() * (1 << 24)).toString(16);
      model.minions[rand1] = {
        spawnable: true
      };
      model.minions[rand2] = {
        spawnable: false
      };
      model.manifest = {
        a: {
          instances: '*',
          opts: {
            commit: '1'
          }
        }
      };
      return scheduler.buildRequired(function() {
        assert.deepEqual(model.manifest.a.required, [rand1]);
        return done();
      });
    });
    it('should find the least loaded minion', function() {
      var minions;
      model.minions = {
        high: {
          load: 9.154
        },
        filler1: {
          load: 2.113
        },
        filler2: {
          load: 3.2532
        },
        low: {
          load: 1.87698
        }
      };
      minions = scheduler.sortMinions();
      assert.equal(minions[0], 'low');
      return assert.equal(minions[minions.length - 1], 'high');
    });
    it('should populate env variables', function(done) {
      var opts, rand;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      server.on("request", function(req, res) {
        res.write(JSON.stringify({
          port: rand
        }));
        return res.end();
      });
      opts = {
        env: {
          PORT: "RANDOM_PORT"
        }
      };
      model.minions.portTest = {
        ip: '127.0.0.1'
      };
      return scheduler.populateOptions("portTest", opts, function(err, opts) {
        assert.equal(null, err);
        assert.equal(opts.env.PORT, rand);
        return done();
      });
    });
    it('should spawn required processes', function(done) {
      model.manifest = {
        one: {
          required: ['minion1', 'minion2'],
          load: 1,
          opts: {
            commit: '1',
            name: 'one'
          }
        },
        two: {
          delta: 2,
          load: 1,
          opts: {
            commit: '2',
            name: 'two'
          }
        }
      };
      server.on("request", function(req, res) {
        return req.on('data', function(data) {
          var parsed, rand, response;
          parsed = JSON.parse(data.toString());
          rand = Math.floor(Math.random() * (1 << 24)).toString(16);
          response = {};
          response[rand] = {
            id: rand,
            status: 'running',
            repo: 'reponame',
            commit: parsed.commit,
            cwd: '/dev/null',
            drone: 'testDrone'
          };
          return res.end(JSON.stringify(response));
        });
      });
      model.minions['minion1'] = {
        ip: '127.0.0.1',
        load: 0,
        spawnable: true
      };
      model.minions['minion2'] = {
        ip: '127.0.0.1',
        load: 0,
        spawnable: true
      };
      return scheduler.spawnMissing(function(errs, procs) {
        assert.equal(errs, null);
        assert.equal(Object.keys(procs).length, 4);
        return done();
      });
    });
    it('should not include any non spawnable drones', function(done) {
      model.manifest = {
        one: {
          required: ['minion1'],
          load: 1,
          opts: {
            commit: '1',
            name: 'one'
          }
        },
        two: {
          delta: 2,
          load: 1,
          opts: {
            commit: '2',
            name: 'two'
          }
        }
      };
      server.on("request", function(req, res) {
        return req.on('data', function(data) {
          var parsed, rand, response;
          parsed = JSON.parse(data.toString());
          rand = Math.floor(Math.random() * (1 << 24)).toString(16);
          response = {};
          response[rand] = {
            id: rand,
            status: 'running',
            repo: 'reponame',
            commit: parsed.commit,
            cwd: '/dev/null',
            drone: 'minion1'
          };
          return res.end(JSON.stringify(response));
        });
      });
      model.minions['minion1'] = {
        ip: '127.0.0.1',
        load: 0,
        spawnable: true
      };
      model.minions['minion2'] = {
        ip: '127.0.0.2',
        load: 0,
        spawnable: false
      };
      return scheduler.spawnMissing(function(errs, procs) {
        var pid, proc;
        for (pid in procs) {
          proc = procs[pid];
          if (proc.drone !== 'minion1') {
            throw new Error('unspawnable minion found');
          }
        }
        assert.equal(errs, null);
        assert.equal(Object.keys(procs).length, 3);
        return done();
      });
    });
    it('should update the portMap', function(done) {
      var processes, rand, randPort;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      randPort = 8000 + Math.floor(Math.random() * 100);
      processes = {};
      processes[rand] = {
        repo: "portTest",
        opts: {
          commit: "1",
          env: {
            PORT: randPort
          }
        }
      };
      scheduler.updatePortMap("portMapTest", processes);
      assert.deepEqual(model.portMap["portMapTest"][rand], {
        repo: "portTest",
        commit: "1",
        port: randPort
      });
      return done();
    });
    it('should calculate the routing table', function(done) {
      model.minions["routingTestSlave1"] = {
        ip: "127.0.0.1",
        processes: {
          pid1: {
            status: "running"
          },
          pid2: {
            status: "running"
          }
        }
      };
      model.minions["routingTestSlave2"] = {
        ip: "127.0.0.2",
        processes: {
          pid1: {
            status: "running"
          },
          pid2: {
            status: "running"
          }
        }
      };
      model.manifest = {
        test1: {
          opts: {
            commit: '1',
            env: {
              PORT: 8000
            }
          }
        },
        test2: {
          opts: {
            commit: '1',
            env: {
              PORT: 8001
            }
          }
        }
      };
      model.portMap = {
        routingTestSlave1: {
          pid1: {
            repo: 'test1',
            commit: '1',
            port: 8000
          },
          pid2: {
            repo: 'test2',
            commit: '1',
            port: 8001
          }
        },
        routingTestSlave2: {
          pid1: {
            repo: 'test1',
            commit: '1',
            port: 8000
          },
          pid2: {
            repo: 'test2',
            commit: '1',
            port: 8001
          }
        }
      };
      return model.serviceInfo.put('test1', {
        healthyCommits: {
          '1': true
        }
      }, function() {
        return model.serviceInfo.put('test2', {
          healthyCommits: {
            '1': true
          }
        }, function() {
          scheduler.calculateRoutingTable(function(err, table) {
            return assert.deepEqual(table, {
              test1: {
                routes: [
                  {
                    host: "127.0.0.1",
                    port: "8000"
                  }, {
                    host: "127.0.0.2",
                    port: "8000"
                  }
                ]
              },
              test2: {
                routes: [
                  {
                    host: "127.0.0.1",
                    port: "8001"
                  }, {
                    host: "127.0.0.2",
                    port: "8001"
                  }
                ]
              }
            });
          });
          return done();
        });
      });
    });
    it('should omit services running the wrong commit', function(done) {
      model.minions["routingTestSlave1"] = {
        ip: "127.0.0.1",
        processes: {
          pid1: {
            status: "running"
          },
          pid2: {
            status: "running"
          }
        }
      };
      model.minions["routingTestSlave2"] = {
        ip: "127.0.0.2",
        processes: {
          pid1: {
            status: "running"
          },
          pid2: {
            status: "running"
          }
        }
      };
      model.manifest = {
        test1: {
          opts: {
            commit: '1',
            env: {
              PORT: 8000
            }
          }
        },
        test2: {
          opts: {
            commit: '1',
            env: {
              PORT: 8001
            }
          }
        }
      };
      model.portMap = {
        routingTestSlave1: {
          pid1: {
            repo: 'test1',
            commit: '1',
            port: 8000
          },
          pid2: {
            repo: 'test2',
            commit: '2',
            port: 8001
          }
        },
        routingTestSlave2: {
          pid1: {
            repo: 'test1',
            commit: '1',
            port: 8000
          },
          pid2: {
            repo: 'test2',
            commit: '1',
            port: 8001
          }
        }
      };
      scheduler.calculateRoutingTable(function(err, table) {
        return assert.deepEqual(table, {
          test1: {
            routes: [
              {
                host: "127.0.0.1",
                port: 8000
              }, {
                host: "127.0.0.2",
                port: 8000
              }
            ]
          },
          test2: {
            routes: [
              {
                host: "127.0.0.2",
                port: 8001
              }
            ]
          }
        });
      });
      return done();
    });
    it('should disseminate the routing table to all minions', function(done) {
      var table;
      model.minions["routingTestSlave1"] = {
        ip: "127.0.0.1",
        processes: {
          pid1: {
            status: "running"
          }
        }
      };
      table = {
        test1: {
          routes: [
            {
              host: "127.0.0.1",
              port: 8000
            }
          ]
        }
      };
      server.on("request", function(req, res) {
        return req.on('data', function(data) {
          var parsed;
          parsed = JSON.parse(data.toString());
          assert.deepEqual(parsed, table);
          return res.end();
        });
      });
      return scheduler.propagateRoutingTable(table, function(err) {
        assert.equal(err, null);
        return done();
      });
    });
    it('should calculate load correctly', function() {
      var load, processes;
      model.manifest = {
        load: {
          load: 1
        }
      };
      processes = {
        one: {
          status: 'running',
          repo: 'load'
        },
        two: {
          status: 'running',
          repo: 'load'
        },
        three: {
          status: 'stopped',
          repo: 'load'
        }
      };
      load = scheduler.calcLoad(processes);
      return assert.equal(load, 2);
    });
    it('should add load to minions as processes are spawned', function(done) {
      model.manifest = {
        one: {
          required: ['minion1', 'minion2'],
          load: 1,
          opts: {
            commit: '1',
            name: 'one'
          }
        },
        two: {
          delta: 2,
          load: 1,
          opts: {
            commit: '2',
            name: 'two'
          }
        }
      };
      server.on("request", function(req, res) {
        return req.on('data', function(data) {
          var parsed, rand, response;
          parsed = JSON.parse(data.toString());
          rand = Math.floor(Math.random() * (1 << 24)).toString(16);
          response = {};
          response[rand] = {
            id: rand,
            status: 'running',
            repo: 'reponame',
            commit: parsed.commit,
            cwd: '/dev/null',
            drone: 'testDrone'
          };
          return res.end(JSON.stringify(response));
        });
      });
      model.minions['minion1'] = {
        ip: '127.0.0.1',
        load: 0,
        spawnable: true
      };
      model.minions['minion2'] = {
        ip: '127.0.0.1',
        load: 0,
        spawnable: true
      };
      return scheduler.spawnMissing(function(errs, procs) {
        assert.equal(errs, null);
        assert.equal(model.minions.minion1.load, 2);
        assert.equal(model.minions.minion2.load, 2);
        return done();
      });
    });
    it('should insert the most recent commit id if requested', function(done) {
      return model.latestCommits.put('one', "I don't know, like a sha or something?", function(err) {
        var data;
        assert.equal(err, null);
        data = {
          opts: {
            commit: 'LATEST',
            name: 'one'
          }
        };
        return scheduler.insertCommit('one', data, function(err, name, data) {
          assert.equal(err, null);
          assert.equal(data.opts.commit, "I don't know, like a sha or something?");
          return done();
        });
      });
    });
    return it('should filter to only spawnable minions', function() {
      var minions;
      model.minions['spawn1'] = {
        ip: '127.0.0.1',
        load: 3,
        spawnable: true
      };
      model.minions['spawn2'] = {
        ip: '127.0.0.1',
        load: 1,
        spawnable: true
      };
      model.minions['nospawn1'] = {
        ip: '127.0.0.1',
        load: 0,
        spawnable: false
      };
      model.minions['nospawn2'] = {
        ip: '127.0.0.1',
        load: 2,
        spawnable: false
      };
      minions = scheduler.filterMinions(model.minions);
      assert.equal(minions.nospawn1, void 0);
      return assert.equal(minions.nospawn2, void 0);
    });
  });

}).call(this);
