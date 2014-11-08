var net = require('net');
var crypto = require('crypto');

var logger = console;

var BASE_PORT = 10000;
var DEST_PORT = 8080;
var PORTCHANGE_TIMEOUT = 60000;
var BLACKLIST_TIMEOUT = 10000;
var blacklist = {};

function noop (err) {
    throw err;
};

function processError (cb, func) {
    var cb = cb || noop;
    return function (err, inputResult) {
        if (err) {
            cb(err);
        } else {
            try {
                func(inputResult, function (outputResult) {
                    cb(null, outputResult);
                });
            } catch (err) {
                cb(err);
            }
        }
    };
}

function isBlackListed (address) {
    if (blacklist.hasOwnProperty(address)) {
        var time = blacklist[address];
        if (Date.now() - time > 10000) {
            logger.log('Removing ' + address + ' from blacklist');
            delete blacklist[address];
            return false;
        } else {
            logger.log('Adding time to ' + address + ' to blacklist');
            blacklist[address] = Date.now();
            return true;
        }
    } else {
        return false;
    }
}

function addOnBlacklist (address) {
    blacklist[address] = Date.now();
}

function setupBidirectionnalPipe (remote) {
    logger.log('Connexion accepted from ' + remote.address().address);

    var local = net.connect(DEST_PORT, function () {
        remote.pipe(local);
        local.pipe(remote);
    });
}

function createRedirectingServer (port) {
    logger.log('Setting server on port ' + port);

    var server = net.createServer(function (remote) {
        var remoteAddress = remote.address().address;
        if (!isBlackListed(remoteAddress)) {
            setupBidirectionnalPipe(remote);
        } else {
            logger.log('Connexion refused from ' + remoteAddress)
        }
    });
    server.listen(port, function () {
        logger.log('Listening on port ' + port);
    });
    return server;
}

function createHoneyPotServer (port) {
    logger.log('Setting a honey pot on port ' + port);

    var server = net.createServer(function (remote) {
        var remoteAddress = remote.address().address;
        logger.log('Blacklisting address ' + remoteAddress);
        addOnBlacklist(remoteAddress);
    });
    server.listen(port, function () {
        logger.log('Honey pot on port ' + port);
    });
    return server;
}

function computeValidPortForMinute (minute, cb) {
    var shasum = crypto.createHash('sha256');
    shasum.update('toto ' + minute);
    var buf = shasum.digest();
    setTimeout(function () {
        cb(null, buf.readUInt8(0));
    });
}

function computeValidPorts (cb) {
    var currentMinute = Math.round(Date.now() / 1000 / 60);
    computeValidPortForMinute(currentMinute);
    shasum.update('toto ' + currentMinute);
    var buf = shasum.digest();
    setTimeout(function () {
        cb(null, buf.readUInt8(0));
    });
}

function getRandomNumbers (count, cb) {
    crypto.randomBytes(count, processError(cb, function (buf, cb) {
        var numbers = [];
        for (var i = 0; i < count; i++) {
            numbers.push(buf.readUInt8(i));
        }
        cb(numbers);
    }));
}

function completeWithRandomUniqueNumbers (totalNumberCount, numbers, rawCb) {
    numbers = numbers || [];
    getRandomNumbers(totalNumberCount - numbers.length, processError(rawCb, function (newNumbers, cb) {
        newNumbers.forEach(function (number) {
            if (numbers.indexOf(number) === -1) {
                numbers.push(number);
            }
        });
        if (totalNumberCount !== numbers.length) {
            completeWithRandomUniqueNumbers(totalNumberCount, numbers, rawCb);
        } else {
            cb(numbers);
        }
    }));
}

function createNewServerSet (rawCb) {
    var servers = [];
    computeValidPorts(processError(rawCb, function (validPorts) {
        completeWithRandomUniqueNumbers(16, validPorts, processError(rawCb, function (numbers, cb) {
            var realServerCreated = false;
            numbers.forEach(function (number) {
                var port = number + BASE_PORT;
                var server = null;
                if (realServerCreated) {
                    server = createHoneyPotServer(port);
                } else {
                    server = createRedirectingServer(port);
                    realServerCreated = true;
                }
                server.$port = port;
                servers.push(server);
            });
        }));
    }));
    setTimeout(function () {
        servers.forEach(function (server) {
            logger.log('Closing server on port ' + server.$port);
            server.close(function () {
                logger.log('Server on port closed ' + server.$port);
            });
        });
        createNewServerSet();
    }, PORTCHANGE_TIMEOUT);
}
