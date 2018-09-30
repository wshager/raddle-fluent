const normalize = (expr) => {
	// TODO mongo convention
	//if(typeof expr === "string" && expr[0] === "$")
	return typeof expr == "function" ? expr(new Builder()) : expr;
};


class Builder {
	constructor() {
		this._root = {$name:"",$args:[]};
		this._insert = this._root.$args;
		// mixin operators
		//Object.assign(this, core);
	}
	append(arg) {
		this._insert.push(arg);
		return this;
	}
	bind(name, type) {
		// TODO VNode + detect type
		// TODO js name to qname
		const paramTypes = type.$args[0];
		const len = paramTypes.$args.length;
		const self = this;
		if(!this[name]) {
			this[name] = (...args) => {
				const ref = self[name+"#"+args.length];
				if(!ref) throw new Error(`Incorrect number of parameters for ${name}, received ${args.length}, have ${len}`);
				return ref(args);
			};
		}
		this[name+"#"+len] = args => self.append({$name: name, $args: args});
		return this;
	}
	export(name, type) {
		// we want to export core functionality first
		// what we need is just import/export/var as core and quot as separate thing
		// we want to bind quots to this builder, so the builder that we predefined
		// exposes the required functions
		// import/export/var don't append, but bind
		// TODO use typedef to detect quot
		// TODO make bind private
		return this.bind(name,normalize(type));
	}
	/**
     * create function type
     */
	def(paramTypes, returnType) {
		// we want to expose a context to each expression
		// but append a result when these are created
		return this.append({
			$name: "function", $args:[
				normalize(paramTypes),
				normalize(returnType)
			]
		});
	}
	string() {
		return this.append(String);
	}
	run(){
		return this._root;
	}
}
exports.Builder = Builder;
