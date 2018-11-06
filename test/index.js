const core = require("../src/index").core;

const rql = core()
	.export("aggregate",
		//$ => $.function($ => $.any($ => $.function($ => $.any($ => $.object()), $ => $.any($ => $.object()))), $ => $.any($ => $.object()))
	)
		.function()
			.function()
				.any().object().seq()
				.any().object().seq()
			.any().object().seq()
	.export("match",
		$ => $.function($ => $.function($ => $.object(), $ => $.boolean()), $ => $.function($ => $.any($ => $.object()), $ => $.any($ => $.object())))
	)
	.export("where",
		$ => $.function($ => $.string().function($ => $.atomic(), $ => $.boolean()), $ => $.function($ => $.object(), $ => $.boolean()))
	)
	.export("eq",
		$ => $.function($ => $.atomic(), $ => $.function($ => $.atomic(), $ => $.boolean()))
	)
	.export("eq",
		$ => $.function($ => $.string().atomic(), $ => $.function($ => $.object(), $ => $.boolean()))
	)
	.export("and")
		.function()
			.function()
				.object().seq()
				.boolean().seq()
			.function()
				.object().seq()
				.boolean().seq()
			.restParams().seq()
		.function()
			.object().seq()
			.boolean().seq()
	.$factory("aggregate#1");

const aggregation = rql()
	.aggregate()
		.match()
			.where("b").eq(2)
			.where("a").eq(1)
	.$mongo();

console.log(JSON.stringify(aggregation));
