var test = module.exports = {};

[
  'basic',
  'logger',
  'cleanup',
  'gwshOptions',
  'gwshPath',
  'customDataDir',
  'genesisOptions',
  'consoleExec',
  'balance',
  'autoMine',
].forEach(function(name) {
  test[name] = require(`./${name}.test`);
});
