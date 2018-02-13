"use strict";


var Q = require('bluebird'),
  chai = require('chai'),
  tmp = require('tmp'),
  path = require('path'),
  shell = require('shelljs'),
  Web3 = require('web3');

var expect = chai.expect,
  should = chai.should();

chai.use(require("chai-as-promised"));


var testUtils = require('./utils');

var source = require('../');



module.exports = {
  before: function(done) {
    this.inst = source({
      
    });
    
    this.inst.start()
      .asCallback(done);
  },
  after: function(done) {
    Q.resolve().then(() => {
      if (this.inst.isRunning) {
        return this.inst.stop();
      }
    })
    .asCallback(done);
  },
  'execute bad console command': function() {
    console.warn('Test will not work until https://github.com/wiseplat/go-wiseplat/issues/2470 is resolved ');
  },
  'execute good console command': function(done) {
    this.inst.consoleExec('web3.toDecimal(\'0x15\')')
      .then((val) => {
        val.should.eql("21");
      })
      .asCallback(done);
  },
};


