import {test} from 'node:test';import {strict as assert} from 'node:assert';import {swipeAim,guidanceCharges} from '../dist/artilleri/aim.js';
test('two-axis gestures change angle and power within bounds',()=>{assert.deepEqual(swipeAim(45,50,60,-40),{angle:55,power:60});assert.deepEqual(swipeAim(85,100,600,-400),{angle:85,power:100});assert.deepEqual(swipeAim(5,10,-600,400),{angle:5,power:10});});
test('guidance is earned in 300-point steps',()=>{assert.equal(guidanceCharges(299,0),0);assert.equal(guidanceCharges(300,0),1);assert.equal(guidanceCharges(600,1),1);});
