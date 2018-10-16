const isSeq = ast => ast.$name === "";

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
		// we want to bind quots to this builder, so the builder that we predefined
		// exposes the required functions
		// import/export/var don't append, but bind
		// TODO use typedef to detect quot
		// TODO make bind private
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
	seq() {
		return this.$append({$name:"", $args:[]});
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
	constructor(prefix = "local", modules = {}, exports = {}, exportsByType = {}, ancestors = [], ancestorInserts = new Map()) {
		this.$ancestors = ancestors;
		this.$ancestorInserts = ancestorInserts;
		this.$root = {$name:"",$args:[]};
		this.$insert = this.$root.$args;
		this.$modules = modules;
		this.$modulePrefix = prefix;
		this.$exports = exports;
		this.$exportsByType = exportsByType;
		// FIXME expose on demand
		this.$modules.core = core;
		Object.assign(this, core);
	}
	$new(root, insert) {
		const cx = new Builder(this.$modulePrefix, this.$modules, this.$exports, this.$exportsByType, this.$ancestors, this.$ancestorInserts);
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
		for(const exprt of exports) {
			this.$expose(exprt, exposedBy);
		}
		return this;
	}
	$append(arg) {
		this.$insert.push(arg);
		return this;
	}
	$push(child) {
		this.$ancestors.push(this.$insert);
		this.insert = child;
		return this;
	}
	$pop() {
		this.$insert = this.$ancestors.pop();
		return this;
	}
	$expose(exprt, exposedBy) {
		// TODO VNode + detect type
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
		if(!this[name]) {
			this[name] = (...args) => {
				// if this function is was ever partially applied
				if(exposedBy && this.$ancestorInserts.has(exposedBy)) {
					// for debugging
					//const initlen = this.$ancestors.length - 1;
					// go up ancestors and expose popped again
					let i = this.$ancestors.length;
					while(i && this.$ancestors[--i] !== exposedBy) {
						const ancestor = this.$ancestors.pop();
						this.$insert = this.$ancestorInserts.get(ancestor);
						this.$ancestorInserts.delete(ancestor);
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
				if(alen < len) {
					// NOTE that partials won't become full (so we have to call 'seq')
					if(!this.$ancestorInserts.has(exprt)) {
						this.$ancestors.push(exprt);
						this.$ancestorInserts.set(exprt, this.$insert);
					}
					const ref = {$name:"", $args: []};
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
	get $ast() {
		const root = this.$root;
		return root.$args.length === 1 ? root.$args[0] : root;
	}
	get $mongo() {
		// TODO mixin
		const convert = (part) => {
			if(Array.isArray(part)) return part.map(arg => convert(arg));
			if(!part.$args) return part;
			// seq args to array, unless 'where'
			let qname = part.$name;
			let args = part.$args;
			if(qname === "") {
				console.log(args);
				return args.reduce((acc, arg) => Object.assign(acc, convert(arg)), {});
			}
			if(qname === "where") {
				const path = args[0];
				args = args.slice(1);
				return {
					[path]: args.reduce((acc, arg) => Object.assign(acc, convert(arg)), {})
				};
			}
			return {
				["$"+qname]: args.length == 1 ? convert(args[0]) : convert(args)
			};
		};
		// aggregation operators
		/*const ops = {
			eq: 1,
			ne: 1,
			gt: 1,
			lt: 1,
			gte: 1,
			lte: 1,
			exists: 1,
			type: 1,
			in: 2,
			nin: 2,
		};*/
		// TODO convert recursively
		return convert(this.$root);
	}
}
exports.Builder = Builder;
