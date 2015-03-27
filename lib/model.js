var Model, levelup, model;

levelup = require('level', Model = function () {
    this.minionCheckinInterval = process.env.CHECKIN_INTERVAL || 1000;
    this.ttl = 5 * this.minionCheckinInterval;
    this.minions = {};
    this.portMap = null;
    this.currentRoutingTableHash = '';
    this.latestCommits = levelup('./commits.db');
    this.prevCommits = levelup('./prevCommits.db');
    this.serviceInfo = levelup('./serviceInfo.db', {
        valueEncoding: 'json'
    });
    return this;
});

model = new Model();

module.exports = model;


