const Builder = require("../src/index").Builder;

let $ = new Builder("rql");

// TODO:
// - assume exports in module namespace (we're not exporting smthg else!)
// - use default prefix for exposing

$ = $.export("aggregate",
	$ => $.def($ => $.def($ => $.any($ => $.obj()), $ => $.any($ => $.obj())), $ => $.any($ => $.obj()))
).export("match",
	$ => $.def($ => $.def($ => $.obj(), $ => $.boolean()), $ => $.def($ => $.any($ => $.obj()), $ => $.any($ => $.obj())))
).export("where",
	$ => $.def($ => $.string().def($ => $.atomic(), $ => $.boolean()), $ => $.def($ => $.obj(), $ => $.boolean()))
).export("eq",
	$ => $.def($ => $.atomic(), $ => $.def($ => $.atomic(), $ => $.boolean()))
).export("eq",
	$ => $.def($ => $.string().atomic(), $ => $.def($ => $.obj(), $ => $.boolean()))
).export("and",
	$ => $.def($ => $.def($ => $.obj(), $ => $.boolean()).def($ => $.obj(), $ => $.boolean()).restParams(), $ => $.def($ => $.obj(), $ => $.boolean()))
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
