"use strict";


var Q = require('bluebird'),
chai = require('chai'),
tmp = require('tmp'),
path = require('path'),
shell = require('shelljs'),
which = require('which'),
Web3 = require('web3');

var expect = chai.expect,
should = chai.should();


var testUtils = require('./utils');

var source = require('../');




module.exports = {
  'bad path': function(done) {
    this.inst = source({
      gwshPath: '/usr/bin/doesnotexist',
    });
    
    this.inst.start()
    .then(() => {
      throw new Error('Should not be here');
    })
    .catch((err) => {
      err += '';
      
      err.should.contain('Execution failed');
    })
    .asCallback(done);    
  },
  
  'good path': {
    beforeEach: function() {
      var origGwshPath = which.sync('gwsh');
      this.binDir = path.join(__dirname, 'bin');
      
      shell.rm('-rf', this.binDir);
      shell.mkdir('-p', this.binDir);
      
      this.gwshPath = path.join(this.binDir, 'gwsh');
      
      shell.cp(origGwshPath, this.gwshPath);
    },
    
    afterEach: function(done) {
      shell.rm('-rf', this.binDir);
      
      if (this.inst) {
        this.inst.stop().asCallback(done);
      } else {
        done();
      }
    },
    
    default: function(done) {
      this.inst = source({
        // verbose: true,
        gwshPath: this.gwshPath,
      });
      
      this.inst.start().asCallback(done);
    },
    
    'path with spaces': function(done) {
      var newDir = path.join(this.binDir, 'child dir');
      
      shell.mkdir('-p', newDir);
      
      var newGwshPath = path.join(newDir, 'gwsh');
      
      shell.cp(this.gwshPath, newGwshPath);

      this.inst = source({
        // verbose: true,
        gwshPath: newGwshPath,
      });
      
      this.inst.start().asCallback(done);
    },
  }
};

