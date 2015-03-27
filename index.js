#!/usr/bin/env node

var schedule, model, route, scheduler, util, webserver, websocket, debug, routeInterval;

debug = require('debug-levels')('master');

scheduler = require('./lib/scheduler');

websocket = require('./lib/websocket');

webserver = require('./lib/webserver');

webserver.listen(4001);

util = require('./lib/util');

model = require('./lib/model');

routeInterval = process.env.ROUTEINTERVAL || 3 * 1000;

schedule = function () {

    scheduler.getManifest(function (err) {
        if (err != null) {
            //Errors in the manifest should not happen
            throw new Error(JSON.stringify(err));
        }
        scheduler.buildRequired(function () {
            scheduler.markHealthy(function (err) {
                if (err != null) {
                    throw err;
                }
                scheduler.spawnMissing(function (err, procs) {
                    if (err != null) {
                        debug.error('spawnMissing', err, procs);
                    }

                    if (procs && Object.keys(procs).length !== 0) {
                        debug.info('spawned', JSON.stringify(procs));
                    }

                    setTimeout(schedule, model.ttl);
                });
            });
        });
    });
};

route = function () {
    return scheduler.calculateRoutingTable(function (err, table) {
        var hash;
        if (err != null) {
            return debug.error('route', err);
        }
        if (table == null) {
            return debug.warn('route', 'table not calculated');
        }
        hash = util.hashObj(table);
        if (hash !== model.currentRoutingTableHash) {
            scheduler.propagateRoutingTable(table, function (errs) {
                if (errs == null) {
                    debug.verbose('route', 'changes detected', hash, table)
                    model.currentRoutingTableHash = hash;
                }
                if (errs != null) {
                    debug.error(errs);
                }
            });
        }
    });
};

schedule();

debug.info('minion checkin interval', model.minionCheckinInterval);

/*
 setTimeout(function () {
 return setInterval(function () {
 return route();
 }, routeInterval);
 }, 1500);
 */
