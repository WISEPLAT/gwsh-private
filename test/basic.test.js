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
  before: function() {
    this.inst = source();
  },
  'not started': function() {
    this.inst.isRunning.should.be.false;
    expect(this.inst.account).to.be.undefined;
  },
  'not stoppable': function(done) {
    this.inst.stop()
      .catch((err) => {
        err.toString().should.contain('Not started');
      })
      .asCallback(done);
  },
  'startup error': {
    beforeEach: function(done) {
      this.origInst = source();
      
      this.origInst.start().asCallback(done);
    },
    afterEach: function(done) {
      this.origInst.stop().asCallback(done);
    },
    default: function(done) {
      this.inst = source({
        // verbose: true
      });
      
      this.inst.start()
        .then(() => {
          throw new Error('unexpected');
        })
        .catch((err) => {
          err = '' + err;
          err.should.contain('address already in use');
        })
        .asCallback(done);      
    },
  },
  'once started': {
    before: function(done) {
      this.inst.start()
        .asCallback(done);
    },
    after: function(done) {
      Q.try(() => {
        if (this.inst.isRunning) {
          return this.inst.stop();
        }
      })
      .asCallback(done);
    },
    'is running': function() {
      this.inst.isRunning.should.be.true;
      expect(this.inst.pid > 0).to.be.true;
    },
    'account': function() {
      (this.inst.account || '').length.should.eql(42);
    },
    'httpRpcEndpoint': function() {
      (this.inst.httpRpcEndpoint || '').should.eql(`http://localhost:8545`);
    },
    'data dir': function() {
      expect((this.inst.dataDir || '').length > 0).to.be.true;
    },
    'attach console': {
      'check coinbase': function() {
        let out = testUtils.gwshExecJs(this.inst.dataDir, `wsh.coinbase`);
        
        out.trim().should.eql(`\"${this.inst.account}\"`);
      },    
      'check balance': function() {
        let out = testUtils.gwshExecJs(this.inst.dataDir, `web3.fromWei(wsh.getBalance(wsh.coinbase),"wise")`);

        out.trim().should.eql('0');
      },  
    },
    'rpc': {
      before: function() {
        this.web3 = new Web3();
        this.web3.setProvider(new this.web3.providers.HttpProvider(`http://localhost:8545`));
      },
      'get coinbase': function() {
        this.web3.wsh.coinbase.should.eql(`${this.inst.account}`);
      },
    }
  },
};


