
(function() {
  var EventEmitter, WebSocket, assert, http, model, server, util, wss;

  assert = require('assert');

  model = require("../lib/model");

  util = require("../lib/util");

  WebSocket = require('ws');

  EventEmitter = require('events').EventEmitter;

  wss = null;

  http = require('http');

  server = http.createServer();

  describe("websocket", function() {
    before(function(done) {
      wss = require('../lib/websocket');
      model.ttl = 5;
      return done();
    });
    after(function(done) {
      wss.close();
      return done();
    });
    it("should add clients to the database", function(done) {
      var rand, ws;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      ws = new WebSocket("ws://localhost:4000");
      ws.on('open', function() {
        return ws.send(JSON.stringify({
          id: rand,
          secret: "shortfin",
          type: "checkin",
          apiVersion: util.apiVersion
        }));
      });
      ws.on('error', function(err) {
        throw new Error(err);
      });
      return ws.on('message', function(message) {
        assert(model.minions[rand]);
        assert.equal(model.minions[rand].ip, "127.0.0.1");
        assert.equal(model.minions[rand].apiVersion, util.apiVersion);
        return done();
      });
    });
    it("should update the port map", function(done) {
      var rand, ws;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      ws = new WebSocket("ws://localhost:4000");
      ws.on('open', function() {
        return ws.send(JSON.stringify({
          id: rand,
          secret: "shortfin",
          type: "checkin",
          apiVersion: util.apiVersion,
          processes: {
            somepid: {
              id: 'somepid',
              status: 'running',
              repo: 'portTest',
              opts: {
                commit: '1',
                env: {
                  PORT: 3000
                }
              }
            }
          }
        }));
      });
      ws.on('error', function(err) {
        throw new Error(err);
      });
      return ws.on('message', function(message) {
        assert.deepEqual(model.portMap[rand].somepid, {
          repo: "portTest",
          commit: "1",
          port: 3000
        });
        return done();
      });
    });
    it("should delete stale clients", function(done) {
      var rand, ws;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      ws = new WebSocket("ws://localhost:4000");
      ws.on('open', function() {
        return ws.send(JSON.stringify({
          id: rand,
          secret: "shortfin",
          type: "checkin",
          apiVersion: util.apiVersion,
          processes: {}
        }));
      });
      ws.on('error', function(err) {
        throw new Error(err);
      });
      return ws.on('message', function(message) {
        assert(model.minions[rand]);
        return setTimeout(function() {
          return done(assert.equal(void 0, model.minions[rand]));
        }, 7);
      });
    });
    it("should emit events passed up from minions", function(done) {
      var rand, ws;
      rand = Math.floor(Math.random() * (1 << 24)).toString(16);
      ws = new WebSocket("ws://localhost:4000");
      ws.on('open', function() {
        return ws.send(JSON.stringify({
          id: rand,
          secret: "shortfin",
          type: "event",
          event: "exit",
          info: {
            code: 2,
            signal: "SIGTERM"
          }
        }));
      });
      ws.on('error', function(err) {
        throw new Error(err);
      });
      return wss.once('minionEvent', function(event) {
        return done(assert.deepEqual(event, {
          minionId: rand,
          type: "exit",
          info: {
            code: 2,
            signal: "SIGTERM"
          }
        }));
      });
    });
    it("should be an eventEmitter", function() {
      return assert(wss instanceof EventEmitter);
    });
    it("should re-propagate the routing table if a node isn't up to date", function(done) {
      var ws;
      model.portMap = {};
      model.minions = {
        routingTableTest: {
          ip: '127.0.0.1'
        }
      };
      server.listen(3000);
      server.on('request', function(req, res) {
        assert.equal(req.url, '/routingTable');
        return req.on('data', function(data) {
          var parsed;
          parsed = JSON.parse(data.toString());
          assert.deepEqual(parsed, {});
          server.removeAllListeners("request");
          server.close();
          return done();
        });
      });
      ws = new WebSocket("ws://localhost:4000");
      ws.on('open', function() {
        return ws.send(JSON.stringify({
          secret: "shortfin",
          type: "checkin",
          apiVersion: util.apiVersion,
          id: "routingTableTest",
          processes: {},
          routingTableHash: "foo"
        }));
      });
      return ws.on('error', function(err) {
        throw new Error(err);
      });
    });
    it("shouldn't re-propagate the routing table if a node is up to date", function(done) {
      var ws;
      model.portMap = {};
      model.currentRoutingTableHash = "bar";
      model.minions = {
        routingTableTest: {
          ip: '127.0.0.1'
        }
      };
      server.listen(3000);
      server.on('request', function(req, res) {
        throw new Error("Routing table request recieved!");
      });
      setTimeout(function() {
        server.removeAllListeners("request");
        server.close();
        return done();
      }, 400);
      ws = new WebSocket("ws://localhost:4000");
      ws.on('open', function() {
        return ws.send(JSON.stringify({
          secret: "shortfin",
          type: "checkin",
          apiVersion: util.apiVersion,
          id: "routingTableTest",
          processes: {},
          routingTableHash: "bar"
        }));
      });
      return ws.on('error', function(err) {
        throw new Error(err);
      });
    });
    return it('should mark checkins as unspawnable where the api version is not matching', function(done) {
      var ws;
      ws = new WebSocket("ws://localhost:4000");
      return ws.on('open', function() {
        ws.send(JSON.stringify({
          secret: 'shortfin',
          type: 'checkin',
          id: 'apiVersionTest',
          processes: {},
          routingTableHash: 'bar',
          apiVersion: '0'
        }));
        return setTimeout(function() {
          assert.equal(model.minions.apiVersionTest.spawnable, false);
          return done();
        }, 1);
      });
    });
  });

}).call(this);
