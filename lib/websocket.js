var MASTER_PASS, WebSocketServer, model, scheduler, util, wss, debug;

debug = require('debug-levels')('websocket');

WebSocketServer = require('ws').Server;

model = require('../lib/model');

scheduler = require('./scheduler');

util = require('../lib/util');

MASTER_PASS = process.env.MASTER_PASS || "shortfin";

wss = new WebSocketServer({
    port: 4000
});

wss.on('connection', function (ws) {
    debug.info('connection');
    return ws.on('message', function (message) {
        var parsed;
        parsed = JSON.parse(message);
        if (parsed.secret !== MASTER_PASS) {
            return ws.send(JSON.stringify({
                status: 401
            }));
        }
        switch (parsed.type) {
            case "checkin":
                parsed.spawnable = true;
                if (parsed.apiVersion !== util.apiVersion) {
                    parsed.spawnable = false;
                }
                if (model.minions[parsed.id] != null) {
                    clearTimeout(model.minions[parsed.id].timer);
                } else {
                    debug.info('minion detected', parsed.id);
                }
                model.minions[parsed.id] = {
                    ip: ws._socket.remoteAddress,
                    processes: parsed.processes,
                    spawnable: parsed.spawnable,
                    apiVersion: parsed.apiVersion,
                    load: scheduler.calcLoad(parsed.processes),
                    timer: setTimeout(function () {
                        delete model.minions[parsed.id];
                        debug.warn('minion timeout', parsed.id);
                        if ((model.portMap != null) && (model.portMap[parsed.id] != null)) {
                            return delete model.portMap[parsed.id];
                        }
                    }, model.ttl)
                };
                scheduler.updatePortMap(parsed.id, parsed.processes);
                if (parsed.routingTableHash !== model.currentRoutingTableHash) {
                    scheduler.calculateRoutingTable(function (err, table) {
                        if (err != null) {
                            return debug.warn('connection', 'calculate table', err);
                        }
                        return scheduler.propagateRoutingTable(table, function (err) {
                            if (err != null) {
                                return debug.warn('connection', 'propagate table', err);
                            }
                        });
                    });
                }
                return ws.send(JSON.stringify({
                    status: 200
                }));
            case "event":
                return wss.emit("minionEvent", {
                    minionId: parsed.id,
                    type: parsed.event,
                    info: parsed.info
                });
            default:
                return ws.send(JSON.stringify({
                    status: 404
                }));
        }
    });
});

module.exports = wss;
