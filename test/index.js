const core = require("../src/index").core;


const rql = () => {
	let $ = core();
	return $ = $.export("aggregate",
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
	).$module("aggregate#1");
};

const $ = rql()
	.aggregate()
	.match()
	.and()
	.eq("$a",1).seq()
	.eq("$b",2);
//.where("b").eq(2).seq(1)
//.where("a").eq(1);

console.log(JSON.stringify($.$mongo()));
