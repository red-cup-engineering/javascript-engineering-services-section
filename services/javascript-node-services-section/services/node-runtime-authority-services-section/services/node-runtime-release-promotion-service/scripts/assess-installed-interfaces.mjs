#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {assessInstalledInterfaces} from '../src/assess-installed-interfaces.mjs';
if(process.argv.length!==4)throw new TypeError('usage: assess-installed-interfaces INPUT.json REPORT.json');
const report=assessInstalledInterfaces(JSON.parse(readFileSync(process.argv[2],'utf8')));
writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,modules:report.modules,boundaries:report.boundaries,findings:report.findings.length}));
if(report.findings.length)process.exitCode=1;
