const isSeq = ast => ast.$name === "";

const makeSeq = (args = []) => ({$name:"", $args:args});
//FIXME
//const unwrapIfSeq = value => isSeq(value) ? value.$args[0] : value;

// TODO:
// - add 'appender' body to export to do the insertion of the call
// - provide core functions as a module (how to type?)
// - provide constraints in normalize
const mongoConverters = {
	where(args, convert) {
		console.log(JSON.stringify(args));
		if(args.length != 2) throw "Incorrect length";
		return {
			[args.slice(0,1)]: convert(makeSeq(args.slice(1)))
		};
	}
};

const normalize = (expr, cx) => {
	if(typeof expr == "function") {
		cx = cx.$new();
		expr = expr(cx);
	}
	if(expr instanceof Builder) {
		expr = expr.$ast;
	}
	return expr;
};

const core = {
	/**
     * create function type
     */
	def(paramTypes, returnType) {
		// we want to expose a context to each expression
		// but append a result when these are created
		return this.$append({
			$name: "function", $args:[
				normalize(paramTypes, this),
				normalize(returnType, this)
			]
		});
	},
	export(name, type) {
		// we want to export core functionality first
		// what we need is just import/export/var as core and quot as separate thing
		// exposes the required functions
		// TODO use typedef to detect quot
		type = normalize(type, this);
		const paramTypes = isSeq(type.$args[0]) ? type.$args[0].$args : [type.$args[0]];
		const len = paramTypes.length;
		if(!this.$exports[name]) this.$exports[name] = {};
		this.$exports[name][len] = type;
		const retType = type.$args[1];
		// TODO l3
		//const retTypeStr = l3.toVNodeStream(l3.ensureDoc(retType))
		const retTypeStr = JSON.stringify(retType);
		if(!this.$exportsByType[retTypeStr]) this.$exportsByType[retTypeStr] = [];
		this.$exportsByType[retTypeStr].push(name+"#"+len);
		return this;
	},
	seq(up = 0) {
		// move insert to next arg
		const ancestorLen = this.$ancestors.length;
		if(ancestorLen) {
			const ancestor = this.$ancestors[ancestorLen - 1 - up];
			const { self } = this.$ancestorProps.get(ancestor);
			self.$args.push(makeSeq());
			this.$insert = self.$args[self.$args.length - 1].$args;
			return this;
		}
		return this.$append(makeSeq());
	},
	restParams() {
		return this.$append({$name:"rest-params", $args:[]});
	}
};

// we need these types to begin with
// to be precise, we need to add rules that say types may appear under export
// and subtypes may appear under supertypes
// but the type calls themselves don't have types
const types = ["string","number","atomic","boolean","any","many","one","obj","array"];

types.forEach(op => {
	core[op] = function(...args) {
		return this.$append({
			$name: op, $args: args
		});
	};
});

class Builder {
	constructor(prefix = "local", modules = {}, exports = {}, exportsByType = {}, ancestors = [], ancestorProps = new Map(), defaultPrefix = "core") {
		this.$ancestors = ancestors;
		this.$ancestorProps = ancestorProps;
		this.$root = makeSeq();
		this.$insert = this.$root.$args;
		this.$modules = modules;
		this.$modulePrefix = prefix;
		this.$exports = exports;
		this.$exportsByType = exportsByType;
		// FIXME expose on demand
		this.$modules.core = core;
		this.$defaultPrefix = defaultPrefix;
		Object.assign(this, core);
	}
	$new(root, insert) {
		const cx = new Builder(this.$modulePrefix, this.$modules, this.$exports, this.$exportsByType, this.$ancestors, this.$ancestorProps);
		if(root) cx.$root = root;
		if(insert) cx.$insert = insert;
		return cx;
	}
	/**
	 * exposes functions based on type and rules
	 * @param  {[type]} type [description]
	 * @param  {[type]} rules [description]
	 * @return {[type]}         [description]
	 */
	$exposeBy(exposedBy, type /*, rules*/) {
		// TODO parse rules
		// find by return type
		const exports = this.$exportsByType[JSON.stringify(type)] || [];
		//console.log(exposedBy, exports);
		for(const exprt of exports) {
			this.$expose(exprt, exposedBy);
		}
		return this;
	}
	$append(arg) {
		this.$insert.push(arg);
		return this;
	}
	$expose(exprt, exposedBy) {
		// TODO VNode + detect type + private
		// TODO js name to qname
		// TODO handle seqs
		// actually we don't want to bind it to 'this' yet
		// we want to bind it to the active module (by prefix)
		// we only want to expose on the following step
		// furthermore we want to enable param-by-param versions
		// this fills in each param by calling 'seq', starting with second
		// functions should only be checked for length after last seq call
		// export writes to module context,
		// only after creating context for a module will functions be exposed...
		const [name, len] = exprt.split("#");
		const type = this.$exports[name][len];
		const paramTypes = isSeq(type.$args[0]) ? type.$args[0].$args : [type.$args[0]];
		const returnType = isSeq(type.$args[1]) ? type.$args[1].$args[0] : type.$args[1];
		const lastParam = paramTypes[paramTypes.length - 1];
		const lastParamType = isSeq(lastParam) ? lastParam.$args[0] : lastParam;
		const hasRestParams = lastParamType.$name === "rest-params";
		if(!this[name]) {
			this[name] = (...args) => {
				// if this function's caller was ever partially applied
				if(exposedBy && this.$ancestorProps.has(exposedBy)) {
					const { curParamType } = this.$ancestorProps.get(exposedBy);
					if(JSON.stringify(curParamType) !== JSON.stringify(returnType)) {
						// for debugging
						//const initlen = this.$ancestors.length - 1;
						// go up ancestors and expose popped again
						let i = this.$ancestors.length;
						while(i && this.$ancestors[--i] !== exposedBy) {
							const ancestor = this.$ancestors.pop();
							console.log("pop", ancestor);
							const { insert } = this.$ancestorProps.get(ancestor);
							this.$insert = insert;
							this.$ancestorProps.delete(ancestor);
						}
					}
					//if(i < initlen) console.log(exprt, "removed up to",this.$ancestors[i]);
				}
				//if(!ref) throw new Error(`Incorrect number of parameters for ${name}, received ${args.length}, have ${len}`);
				this.$append({$name: name, $args: args.map(arg => normalize(arg, this))});
				// set insert to inserted args
				// cancel when going up
				// TODO keep track of args filled in
				// last is a reference to AST of this call (i.e. self)
				const last = this.$insert[this.$insert.length - 1];
				const alen = last.$args.length;
				if(alen < len || hasRestParams) {
					console.log("open", name);
					// NOTE that partials won't become full (so we have to call 'seq')
					if(!this.$ancestorProps.has(exprt)) {
						this.$ancestors.push(exprt);
						const curParamType = paramTypes[paramTypes.length - 1];
						this.$ancestorProps.set(exprt, {
							insert: this.$insert,
							self: last,
							curParamType: curParamType
						});
					}
					const ref = makeSeq();
					last.$args.push(ref);
					// not finished = expose only allowed
					return this.$new(this.$root, ref.$args).$exposeBy(exprt, paramTypes[alen]);
				}
				// finished = re-expose by ancestors (if have) on last param
				if(this.$ancestors.length) {
					let cx = this.$new(this.$root, this.$insert);
					this.$ancestors.forEach(ancestor => {
						const [name, len] = ancestor.split("#");
						const type = cx.$exports[name][len];
						const paramTypes = isSeq(type.$args[0]) ? type.$args[0].$args : [type.$args[0]];
						cx = cx.$exposeBy(ancestor, paramTypes[paramTypes.length -1]);
					});
					return cx;
				}
				return this;
			};
		}
		return this;
	}
	$setDefaultPrefix(prefix) {
		this.$defaultPrefix = prefix;
		return this;
	}
	get $ast() {
		const root = this.$root;
		return root.$args.length === 1 ? root.$args[0] : root;
	}
	$mongo(converters = mongoConverters) {
		// TODO mixin
		const convert = (part) => {
			if(Array.isArray(part)) {
				console.log(part);
				return part.map(arg => convert(arg));
			}
			if(!part.$args) return part;
			// seq args to array, unless 'where'
			let qname = part.$name;
			let args = part.$args;
			if(qname === "") {
				return args.reduce((acc, arg) => Object.assign(acc, convert(arg)), {});
			}
			//const name2 = qname + "#" + args.length;
			if(converters.hasOwnProperty(qname)) {
				return converters[qname](args, convert);
			}
			return {
				["$"+qname]: args.length == 1 ? convert(args[0]) : convert(args)
			};
		};
		// TODO convert recursively
		return convert(this.$root);
	}
}
exports.Builder = Builder;
