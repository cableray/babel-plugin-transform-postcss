'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports._retries = exports._streams = exports.main = undefined;

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// exponential backoff, roughly 100ms-6s
const retries = [1, 2, 3, 4, 5].map(num => Math.exp(num) * 40);

const streams = { stdout: process.stdout }; // overwritable by tests

const communicate = async function communicate(socketPath, message) {
  await new Promise((resolve, reject) => {
    const client = _net2.default.connect(socketPath, () => {
      client.end(message);
      client.pipe(streams.stdout);
    });

    client.on('error', err => reject(err));
    client.on('close', err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const main = async function main(...args) {
  try {
    await communicate(...args);
  } catch (err) {
    const recoverable = err.code === 'ECONNREFUSED' || err.code === 'ENOENT';

    if (recoverable && retries.length) {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          main(...args).then(resolve, reject);
        }, retries.shift());
      });
    }
  }
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
exports._retries = retries;