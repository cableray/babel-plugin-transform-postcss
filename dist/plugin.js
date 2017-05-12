'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.stopServer = exports.startServer = undefined;
exports.default = transformPostCSS;

var _path = require('path');

var _child_process = require('child_process');

// note: socket path is important to keep short as it will be truncated if it
// exceeds certain platform limits. for this reason, we're writing to /tmp
// instead of using os.tmpdir (which can, on platforms like darwin, be quite
// long & per-process).
const projectId = process.cwd().toLowerCase().replace(/[^a-z]/ig, '');
const socketName = `bptp-${projectId}.sock`;
const socketPath = (0, _path.join)('/tmp', socketName);
const tmpPath = (0, _path.join)('/tmp', `bptp-${projectId}`);

const nodeExecutable = process.argv[0];
const clientExcutable = (0, _path.join)(__dirname, 'postcss-client.js');
const serverExcutable = (0, _path.join)(__dirname, 'postcss-server.js');

let server;

const startServer = () => {
  server = (0, _child_process.spawn)(nodeExecutable, [serverExcutable, socketPath, tmpPath], {
    env: process.env, // eslint-disable-line no-process-env
    stdio: 'inherit'
  });

  server.unref();
};

const stopServer = () => {
  if (!server) {
    return;
  }

  server.kill();
  server = null;
  process.removeListener('exit', stopServer);
};

const launchServer = () => {
  if (server) {
    return;
  }

  startServer();

  process.on('exit', stopServer);
};

function transformPostCSS({ types: t }) {
  const extensions = ['.css', '.less', '.scss', '.sass'];

  return {
    visitor: {
      CallExpression(path, { file }) {
        const { callee: { name: calleeName }, arguments: args } = path.node;

        if (calleeName !== 'require' || !args.length || !t.isStringLiteral(args[0])) {
          return;
        }

        const [{ value: stylesheetPath }] = args;
        const stylesheetExtension = (0, _path.extname)(stylesheetPath);

        if (extensions.indexOf(stylesheetExtension) !== -1) {
          launchServer();

          const requiringFile = file.opts.filename;
          const cssFile = (0, _path.resolve)((0, _path.dirname)(requiringFile), stylesheetPath);
          const data = JSON.stringify({ cssFile });
          const execArgs = [clientExcutable, socketPath, data];
          const result = (0, _child_process.execFileSync)(nodeExecutable, execArgs, {
            env: process.env }).toString('utf8');
          const tokens = JSON.parse(result || '{}');

          const expression = path.findParent(test => test.isVariableDeclaration() || test.isExpressionStatement());

          expression.addComment('trailing', ` @related-file ${stylesheetPath}`, true);

          path.replaceWith(t.objectExpression(Object.keys(tokens).map(token => t.objectProperty(t.stringLiteral(token), t.stringLiteral(tokens[token])))));
        }
      }
    }
  };
}

exports.startServer = startServer;
exports.stopServer = stopServer;