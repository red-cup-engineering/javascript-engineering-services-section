#!/usr/bin/env node
import{project561GroupCodebaseReading}from"../src/codebase-projection.mjs";const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");if(import.meta.main)process.stdout.write(`${JSON.stringify(project561GroupCodebaseReading(input.carriers??input,input.params??{},input.options??{}),null,2)}\n`);
