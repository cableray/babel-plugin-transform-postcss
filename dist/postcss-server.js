'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports._streams = exports.main = undefined;

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _postcss = require('postcss');

var _postcss2 = _interopRequireDefault(_postcss);

var _postcssLoadConfig = require('postcss-load-config');

var _postcssLoadConfig2 = _interopRequireDefault(_postcssLoadConfig);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const debug = (0, _debug2.default)('babel-plugin-transform-postcss');
const streams = { stderr: process.stderr }; // overwritable by tests
const md5 = data => _crypto2.default.createHash('md5').update(data).digest('hex');
const error = (...args) => {
  let prefix = 'babel-plugin-transform-postcss: ';
  const message = _util2.default.format(...args);

  if (streams.stderr.isTTY) {
    prefix = `\x1b[31m${prefix}\x1b[0m`;
  }

  streams.stderr.write(`${prefix}${message}\n`);
};

const main = async function main(socketPath, tmpPath) {

  try {
    _fs2.default.mkdirSync(tmpPath);
  } // eslint-disable-line no-sync
  catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }

  const options = { allowHalfOpen: true };
  const server = _net2.default.createServer(options, connection => {
    let data = '';

    connection.on('data', chunk => {
      data += chunk.toString('utf8');
    });

    connection.on('end', async () => {
      try {
        let tokens, cache;
        const { cssFile } = JSON.parse(data);
        const cachePath = `${_path2.default.join(tmpPath, cssFile.replace(/[^a-z]/ig, ''))}.cache`;
        const source = // eslint-disable-next-line no-sync
        _fs2.default.readFileSync(cssFile, 'utf8');
        const hash = md5(source);

        // eslint-disable-next-line no-sync
        try {
          cache = JSON.parse(_fs2.default.readFileSync(cachePath, 'utf8'));
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err;
          }
        }

        if (cache && cache.hash === hash) {
          connection.end(JSON.stringify(cache.tokens));

          return;
        }

        const extractModules = (_, resultTokens) => {
          tokens = resultTokens;
        };
        const { plugins, options: postcssOpts } = await (0, _postcssLoadConfig2.default)({ extractModules }, _path2.default.dirname(cssFile));

        const runner = (0, _postcss2.default)(plugins);

        try {
          await runner.process(source, Object.assign({
            from: cssFile,
            to: cssFile }, postcssOpts));
        } catch (e) {
          //ideally, write an error somewhere unobtrusive
        }

        cache = {
          hash,
          tokens
        };

        // eslint-disable-next-line no-sync
        _fs2.default.writeFileSync(cachePath, JSON.stringify(cache));

        connection.end(JSON.stringify(tokens));
      } catch (err) {
        error(err.stack);
        connection.end();
      }
    });
  });

  if (_fs2.default.existsSync(socketPath)) {
    // eslint-disable-line no-sync
    error(`Server already running on socket ${socketPath}`);
    process.exit(1);

    return server; // tests can make it past process.exit
  }

  await new Promise((resolve, reject) => {
    server.on('error', err => reject(err));
    server.on('listening', () => {
      const handler = () => {
        _fs2.default.unlinkSync(socketPath); // eslint-disable-line no-sync
      };

      server.on('close', () => {
        process.removeListener('exit', handler);
        process.removeListener('SIGINT', handler);
        process.removeListener('SIGTERM', handler);
      });

      process.on('exit', handler);
      process.on('SIGINT', handler);
      process.on('SIGTERM', handler);

      resolve();
    });

    server.listen(socketPath, () => {
      debug(`babel-plugin-transform-postcss server running on socket ${socketPath}`);
    });
  });

  return server;
};

/* istanbul ignore if */
if (require.main === module) {
  (async () => {
    try {
      await main(...process.argv.slice(2));
    } catch (err) {
      process.stderr.write(`${err.stack}\n`);process.exit(1);
    }
  })();
}

exports.main = main;
exports._streams = streams;