"use strict";

var shell = require('shelljs');


const GWSH = require('which').sync('gwsh');



exports.canAttach = function(dataDir) {
  let ret = shell.exec(`${GWSH} --exec 'wsh.coinbase' attach ipc://${dataDir}/gwsh.ipc`, {
    silent: true,
    async: false,
  });

  return ret.code === 0;
};


exports.gwshExecJs = function(dataDir, jsToExecute) {
  let ret = shell.exec(`${GWSH} --exec '${jsToExecute}' attach ipc://${dataDir}/gwsh.ipc`, {
    silent: true,
    async: false,
  });

  if (ret.code !== 0) {
    throw new Error('Exec error: ' + ret.stderr);
  }

  return ret.stdout;
};










