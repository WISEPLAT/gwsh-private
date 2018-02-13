"use strict";


var Q = require('bluebird'),
  chai = require('chai'),
  tmp = require('tmp'),
  path = require('path'),
  shell = require('shelljs'),
  Web3 = require('web3');

var expect = chai.expect,
  should = chai.should();


var testUtils = require('./utils');

var source = require('../');





module.exports = {
  'default': {
    beforeEach: function() {
      this.datadir = tmp.dirSync().name;
      // delete it straight away as we will get gwsh-private to create it for us
      shell.rm('-rf', this.datadir);
      
      this.inst = source({
        gwshOptions: {
          datadir: this.datadir,
        },
      });
    },
    afterEach: function(done) {
      Q.resolve()
      .then(() => {
        if (this.inst && this.inst.isRunning) {
          return this.inst.stop();
        }
      })
      .then(() => {
        shell.rm('-rf', this.datadir);
      })
      .asCallback(done);
    },
    'will create it if it doesn\'t exist': function(done) {
      this.inst.start()
      .then(() => {
        shell.test('-e', this.datadir).should.be.true;
      })
      .asCallback(done);
    },
    'can re-use it': function(done) {
      let account = null;
      
      this.inst.start()
      .then(() => {
        account = this.inst.account;
        
        return this.inst.stop();
      })
      .then(() => {
        shell.test('-e', this.datadir).should.be.true;
        
        return this.inst.start();
      })
      .then(() => {
        this.inst.account.should.eql(account);
        
        let out = testUtils.gwshExecJs(this.inst.dataDir, `web3.fromWei(wsh.getBalance(wsh.coinbase),"wise")`);
        
        out.trim().should.eql('0');
      })
      .asCallback(done);
    },
  },
  'relative paths': {
    beforeEach: function() {
      let dirName = 'test/data';
      
      this.datadir = path.join(process.cwd(), dirName);
      // delete it straight away as we will get gwsh-private to create it for us
      shell.rm('-rf', this.datadir);
      
      this.inst = source({
        gwshOptions: {
          datadir: dirName, /* relative path only */
        },
      });
    },
    afterEach: function(done) {
      Q.resolve()
      .then(() => {
        if (this.inst && this.inst.isRunning) {
          return this.inst.stop();
        }
      })
      .then(() => {
        shell.rm('-rf', this.datadir);
      })
      .asCallback(done);
    },
    'resolves relative paths': function(done) {
      this.inst.start()
        .then(() => {
          shell.test('-e', this.datadir).should.be.true;
          
          this.inst.dataDir.should.eql(this.datadir);
        })
        .asCallback(done);
    },
  },
};


