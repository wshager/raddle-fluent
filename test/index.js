const core = require("../src/index").core;

let $ = core();

// TODO:
// - assume exports in module namespace (we're not exporting smthg else!)
// - use default prefix for exposing

$ = $.export("aggregate",
	$ => $.function($ => $.function($ => $.any($ => $.object()), $ => $.any($ => $.object())), $ => $.any($ => $.object()))
).export("match",
	$ => $.function($ => $.function($ => $.object(), $ => $.boolean()), $ => $.function($ => $.any($ => $.object()), $ => $.any($ => $.object())))
).export("where",
	$ => $.function($ => $.string().function($ => $.atomic(), $ => $.boolean()), $ => $.function($ => $.object(), $ => $.boolean()))
).export("eq",
	$ => $.function($ => $.atomic(), $ => $.function($ => $.atomic(), $ => $.boolean()))
).export("eq",
	$ => $.function($ => $.string().atomic(), $ => $.function($ => $.object(), $ => $.boolean()))
).export("and",
	$ => $.function($ => $.function($ => $.object(), $ => $.boolean()).function($ => $.object(), $ => $.boolean()).restParams(), $ => $.function($ => $.object(), $ => $.boolean()))
);

$ = $.$setDefaultPrefix("rql").$expose("aggregate#1");

$ = $
	.aggregate()
	.match()
	.and()
	.eq("$a",1).seq()
	.eq("$b",2);
//.where("b").eq(2).seq(1)
//.where("a").eq(1);

console.log(JSON.stringify($.$mongo()));
