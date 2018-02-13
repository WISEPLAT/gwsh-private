"use strict";

var path = require('path'),
  chalk = require('chalk'),
  Q = require('bluebird'),
  tmp = require('tmp'),
  fs = require('fs'),
  child_process = require('child_process'),
  shell = require('shelljs'),
  which = require('which');


class Gwsh {
  constructor(options) {
    options = options || {};

    // options for gwsh
    this._gwshOptions = Object.assign({
      networkid: 33333,
      port: 60303,
      rpc: true,
      rpcport: 8545,
      rpccorsdomain: "*",
      rpcapi: "admin,db,wsh,debug,miner,net,shh,txpool,personal,web3",
      maxpeers: 0,
      nodiscover: true,
      // reduce overhead
      minerthreads: 1,
      lightkdf: true,
      cache: 16,
      // logging
      // verbosity: 6,
    }, options.gwshOptions, {
      rpc: true,
    });

    // path to gwsh
    this._gwsh = options.gwshPath;

    // genesis options
    this._genesisOptions = options.genesisBlock || null;

    if (!this._gwsh) {
      try {
        this._gwsh = which.sync('gwsh');
      } catch (err) {
        throw new Error('Unable to find "gwsh" executable in PATH');
      }
    }

    // logging
    this._verbose = !!options.verbose;
    this._logger = options.logger || console;

    // auto-mine until balance
    this._initialBalance = parseFloat(options.balance || 0);

    // auto-mine indefinitely
    this._autoMine = !!options.autoMine;
  }

  start() {
    if (this.isRunning) {
      throw new Error('Already running');
    }

    this._log(`Starting...`);

    return this._createDataDir()
      .then(() => this._setupAccountInfo())
      .then(() => this._startGwsh())
      .then((ret) => {
        this._proc = ret.proc;
      });
    ;
  }



  stop(options) {
    return Q.try(() => {
      if (!this._proc) {
        throw new Error("Not started");
      }

      options = Object.assign({
        kill: false,
      }, options);

      return new Q((resolve) => {
        this._proc.on('exit', (code, signal) => {
          this._log(`Stopped.`);

          this._proc = null;

          if (this._tmpDataDir) {
            this._log(`Destroying data...`);

            shell.rm('-rf', this._gwshOptions.datadir);
          }

          resolve({
            code: code,
            signal: signal,
          });
        });

        this._log(`Stopping...`);

        this._proc.kill(options.kill ? 'SIGKILL' : 'SIGTERM');
      });
    });
  }

  /**
   * Execute a command in the JS console of the running gwsh instance.
   * @param  {String} jsCommand
   * @return {Promise}
   */
  consoleExec (jsCommand) {
    return Q.try(() => {
      if (!this._proc) {
        throw new Error("Not started");
      }

      this._log(`Execute in console: ${jsCommand}`);

      return this._exec(
        this._buildGwshCommandLine({
          command: ['--exec', `"${jsCommand}"`, 'attach',
            this._formatPathForCli(`ipc://${this.dataDir}/gwsh.ipc`)
          ]
        })
      ).then((ret) => {
        return ret.stdout;
      });
    });
  }

  get httpRpcEndpoint () {
    return `http://localhost:${this._gwshOptions.rpcport}`;
  }

  get account () {
    return this._account;
  }

  get dataDir () {
    return this._gwshOptions.datadir;
  }

  get genesisFile () {
    return this._genesisFilePath;
  }

  get isRunning () {
    return !!this._proc;
  }

  get pid () {
    return this._proc.pid;
  }

  _createDataDir () {
    return Q.try(() => {
      let options = this._gwshOptions;

      // need to create temporary data dir?
      if (!options.datadir) {
        options.datadir = this._tmpDataDir = tmp.dirSync().name;

        this._log(`Created temporary data dir: ${options.datadir}`);
      }
      // else let's check the given one
      else {
        // resolve path (against current app folder)
        options.datadir = path.resolve(process.cwd(), options.datadir);

        // if not found then try to create it
        if (!shell.test('-e', options.datadir)) {
          this._log(`Creating data dir: ${options.datadir}`);

          shell.mkdir('-p', options.datadir);
        }
      }
    });
  }


  _setupAccountInfo () {
    return Q.try(() => {
      this._genesisFilePath = path.join(this._gwshOptions.datadir, 'genesis.json');

      this._log(`Genesis file: ${this._genesisFilePath}`);

      if (!shell.test('-e', this._genesisFilePath)) {
        this._log(`Creating genesis file...`);

        // create genesis file
        let genesisStr = this._buildGenesisString();
        fs.writeFileSync(this._genesisFilePath, genesisStr);

        // initialize the chain
        this._log(`Creating genesis chain data...`);

        return this._exec(
          this._buildGwshCommandLine({
            command: ['init', this._formatPathForCli(this._genesisFilePath)]
          })
        )
          // start gwsh and create an account
          .then((ret) => {
            this._log(`Creating account...`);

            return this._exec(
              this._buildGwshCommandLine({
                command: ['js',
                  this._formatPathForCli(path.join(__dirname, 'data', 'setup.js'))
                ],
              })
            );
          })
          // load account info
          .then(() => this._loadAccountInfo());
      } else {
        return this._loadAccountInfo();
      }
    });
  }


  _loadAccountInfo () {
    return Q.try(() => {
      this._log(`Loading account info...`);

      // fetch account info from gwsh 
      return this._exec(
        this._buildGwshCommandLine({
          command: ['account', 'list']
        })
      ).then((ret) => {
        let str = ret.stdout;

        // parse and get account id
        let accountMatch = /\{(.+)\}/.exec(str);
        if (!accountMatch) {
          throw new Error('Unable to fetch account info');
        }

        this._account = `0x${accountMatch[1]}`;

        this._log(`Account: ${this._account}`);
      });
    });
  }


  _buildGenesisString () {
    return JSON.stringify(Object.assign({
      "config": {
        "chainId": 1337,
        "homesteadBlock": 0,
        "eip150Block": 0,
        "eip155Block": 0,
        "eip158Block": 0,
      },
      "difficulty": "0xf0000",
      "gasLimit": "0x8000000",
      "alloc": {}
    }, this._genesisOptions), null, 2);
  }


  _runMiningLoop () {
    setTimeout(() => {
      if (!this._proc) {
        return;
      }

      Q.all([
        this.consoleExec(`web3.fromWei(wsh.getBalance('${this._account}'), 'wise')`),
        this.consoleExec(`wsh.mining`),
      ])
      .spread((balance, isMining) => {
        balance = parseFloat(balance.trim());
        isMining = ('true' === isMining.trim());

        let keepGoing = true;

        return Q.try(() => {
          if (this._autoMine) {
            return;
          } else if (this._initialBalance) {
            if (balance < this._initialBalance) {
              this._log(`Account balance (${balance}) is < target (${this._initialBalance}).`);
            } else {
              this._log(`Account balance (${balance}) is >= target (${this._initialBalance}).`);

              keepGoing = false;
            }
          }
        })
        .then(() => {
          if (keepGoing) {
            return Q.try(() => {
              if (!isMining) {
                this._log(`Start mining...`);

                return this.consoleExec('miner.start()');
              }
            })
            .then(() => this._runMiningLoop());
          } else {
            if (isMining) {
              this._log(`Stop mining...`);

              return this.consoleExec('miner.stop()');
            }
          }
        });
      })
      .catch((err) => {
        this._logError('Error fetching account balance', err);
      });
    }, 500);
  }


  _buildGwshCommandLine(opts) {
    opts = Object.assign({
      command: [],
      quoteStrings: true
    }, opts);

    let gwshOptions = this._gwshOptions;

    let str = [];
    for (let key in gwshOptions) {
      let val = gwshOptions[key];

      if (null !== val && false !== val) {
        str.push(`--${key}`);

        if (typeof val === "string") {
          if ('datadir' === key) {
            val = this._formatPathForCli(val);
          } else {
            val = opts.quoteStrings ? `"${val}"` : val;
          }
          str.push(val);
        } else if (typeof val !== "boolean") {
          str.push(`${val}`);
        }
      }
    }

    // add wisebase param
    if (this.account) {
      str.push(`--wisebase`);
      str.push(this.account);
    }

    return [this._gwsh].concat(str, opts.command);
  }


  /**
   * @return {Promise}
   */
  _startGwsh() {
    const gwshcli = this._buildGwshCommandLine({
      quoteStrings: false,
    });

    return this._exec(gwshcli, {
      longRunning: true
    })
      .then((ret) => {
        if (this._initialBalance || this._autoMine) {
          this._log(`Auto-start mining...`);

          this._runMiningLoop();
        }

        return ret;
      });
  }


  /**
   * @return {Promise}
   */
  _exec (cli, options) {
    options = Object.assign({
      longRunning: false,
    }, options);

    // execute a command
    if (!options.longRunning) {
      return new Q((resolve, reject) => {
        cli[0] = this._formatPathForCli(cli[0]);

        const cmdStr = cli.join(' ');

        this._log(`Executing gwsh command:  ${cmdStr}`);

        child_process.exec(cmdStr, (err, stdout, stderr) => {
          if (err) {
            err = new Error(`Execution failed: ${err}`);

            this._logError(err);

            reject(err);
          } else {
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
            });
          }
        });
      });
    }
    // start a node instance
    else {
      return new Q((resolve, reject) => {
        this._log(`Starting gwsh process: ${cli.join(' ')}`);

        let isRunning = false,
        successTimer = null;

        const proc = child_process.spawn(cli[0], cli.slice(1),{
          detached: false,
          shell: false,
          stdio:['ignore', 'pipe', 'pipe'],
        });

        const ret = {
          stdout: '',
          stderr: '',
        };

        const _handleError = (err) => {
          if (isRunning) {
            return;
          }

          clearTimeout(successTimer);

          err = new Error(`Startup error: ${err}`);

          this._logError(err);

          Object.assign(err, ret);

          return reject(err);
        };

        const _handleOutput = (stream) => (buf) => {
          const str = buf.toString();

          ret[stream] += str;

          this._logNode(str);

          if (str.match(/fatal/igm)) {
            _handleError(str);
          }
        };

        proc.on('error', _handleError);
        proc.stdout.on('data', _handleOutput('stdout'));
        proc.stderr.on('data', _handleOutput('stderr'));

        // after 3 seconds assume startup is successful
        successTimer = setTimeout(() => {
          this._log('Node successfully started');

          isRunning = true;

          ret.proc = proc;

          resolve(ret);
        }, 3000);
      });
    }
  }


  _log () {
    if (this._verbose) {
      let args = Array.prototype.map.call(arguments, (a) => {
        return chalk.cyan(a);
      });

      this._logger.info.apply(this._logger, args);
    }
  }


  _logNode (str) {
    if (this._verbose) {
      this._logger.info(str.trim());
    }
  }


  _logError () {
    if (this._verbose) {
      let args = Array.prototype.map.call(arguments, (a) => {
        return chalk.red(a + '');
      });

      this._logger.error.apply(this._logger, arguments);
    }
  }


  _formatPathForCli (pathStr) {
    return (0 <= pathStr.indexOf(' ')) ? `"${pathStr}"` : pathStr;
  }
}


module.exports = function(options) {
  return new Gwsh(options);
};
