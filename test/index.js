const Builder = require("../src/index").Builder;

let $ = new Builder("rql");

$ = $.export("match",
	$ => $.def($ => $.def($ => $.obj(), $ => $.boolean()), $ => $.def($ => $.any($ => $.obj()), $ => $.any($ => $.obj())))
).export("where",
	$ => $.def($ => $.string().def($ => $.atomic(), $ => $.boolean()), $ => $.def($ => $.obj(), $ => $.boolean()))
).export("eq",
	$ => $.def($ => $.atomic(), $ => $.def($ => $.atomic(), $ => $.boolean()))
);

console.log(JSON.stringify($.$expose("match#1").match().where("a").eq(1).where("b").eq(2).$mongo));
