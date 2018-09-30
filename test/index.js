const Builder = require("../src/index").Builder;

const $ = new Builder();

console.log(JSON.stringify($.export("test", $ => $.def($ => $.string().string().run(),$ => $.string().run()).run()).test("a","b").test(1,2).run()));

//console.log(typeof String == "function");
